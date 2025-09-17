// movement.wgsl
// step 1: propose moves into empty targets (contended targets pick highest hash)
// step 2: apply winners; others stay. charge energy costs.

struct Uniforms {
  width: u32,
  height: u32,
  generation: u32,       // tick
  cost_move_milli: u32,  // e.g., 10 for 0.01
  movement_mode: u32,    // 0=random (debug), 1=ppo_action
  _pad0: u32,
}
@group(0) @binding(0) var<uniform> U : Uniforms;

// core fields
@group(0) @binding(1) var<storage, read>      alive_in    : array<u32>;
@group(0) @binding(2) var<storage, read_write> alive_mid  : array<u32>; // after movement (before Life)
@group(0) @binding(3) var<storage, read_write> energy     : array<f32>;
@group(0) @binding(4) var<storage, read>      inbox1      : array<u32>; // stage-3 inbox if needed
@group(0) @binding(5) var<storage, read>      energy_scent: array<u32>; // 0/1 neighbor energy scent
@group(0) @binding(6) var<storage, read_write> last_pos   : array<u32>; // pack x(16) | y(16)

// intent surface: winner writes (flag=1, sx, sy, hash)
struct Intent {
  flag: u32,
  sx: u32,
  sy: u32,
  h: u32,
};
@group(0) @binding(7) var<storage, read_write> intent : array<Intent>;
// action outputs (per-cell), values 0..8 where 0..7=direction, 8=stay
@group(0) @binding(8) var<storage, read>      ppo_actions : array<u32>;

// --- helpers ---

fn idx(col: i32, row: i32) -> u32 {
  let W = i32(U.width);
  let H = i32(U.height);
  let x = ( (col % W) + W ) % W;
  let y = ( (row % H) + H ) % H;
  return u32(y) * U.width + u32(x);
}

fn moore_dir(d: u32) -> vec2<i32> {
  switch(d){
    case 0u: { return vec2<i32>(-1, -1); }
    case 1u: { return vec2<i32>( 0, -1); }
    case 2u: { return vec2<i32>( 1, -1); }
    case 3u: { return vec2<i32>(-1,  0); }
    case 4u: { return vec2<i32>( 1,  0); }
    case 5u: { return vec2<i32>(-1,  1); }
    case 6u: { return vec2<i32>( 0,  1); }
    default: { return vec2<i32>( 1,  1); }
  }
}

fn rand_hash3(x: u32, y: u32, t: u32) -> u32 {
  var h = x * 374761393u + y * 668265263u + t * 2246822519u;
  h ^= (h >> 13u);
  h *= 1274126177u;
  return h ^ (h >> 16u);
}

//  step 1: propose (winner = max hash) and charge energy for attempting a move.

@compute @workgroup_size(16,16)
fn move_propose(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * W + gid.x;

  // clear intent at my cell (once per tick)
  if (alive_in[i] == 0u) { return; }

  // build list of empty neighbor directions once
  var empty_dirs: array<u32, 8>;
  var n_empty: u32 = 0u;
  for (var d: u32 = 0u; d < 8u; d = d + 1u) {
    let off_scan = moore_dir(d);
    let j_scan = idx(x + off_scan.x, y + off_scan.y);
    if (alive_in[j_scan] == 0u) {
      empty_dirs[n_empty] = d;
      n_empty = n_empty + 1u;
    }
  }

  // decide target direction based on movement_mode
  var target_dir: u32 = 8u; // 8 = stay
  switch (U.movement_mode) {
    case 1u: { // ppo-directed action
      let act = ppo_actions[i] % 9u; // 0..7 dir, 8=stay
      if (act == 8u) {
        return; // explicit stay, no cost
      }
      let off_act = moore_dir(act);
      let j_act = idx(x + off_act.x, y + off_act.y);
      if (alive_in[j_act] == 0u) {
        target_dir = act;
      } else {
        // invalid move (blocked), charge attempt cost and stay
        let attempt_cost = 0.05;
        energy[i] = max(0.0, energy[i] - attempt_cost);
        return;
      }
    }
    default: { // 0=random (debug)
      if (n_empty == 0u) { return; }
      let seed = rand_hash3(u32(x), u32(y), U.generation);
      target_dir = empty_dirs[(seed % n_empty)];
    }
  }

  // compute target index from selected direction
  let off = moore_dir(target_dir);
  let tgt_idx = idx(x + off.x, y + off.y);

  // compute tie-break hash (higher wins)
  let h = rand_hash3(u32(x) ^ 0x9e3779b9u, u32(y) ^ 0x7f4a7c15u, U.generation);

  // if  hash beats current, write as winner
  let cur = intent[tgt_idx];
  if (cur.flag == 0u || h > cur.h) {
    var w: Intent;
    w.flag = 1u;  w.sx = u32(x);  w.sy = u32(y);  w.h = h;
    intent[tgt_idx] = w;
  }

  // charge movement attempt cost (0.05 for attempting)
  let attempt_cost = 0.05;
  energy[i] = max(0.0, energy[i] - attempt_cost);
}

// step 2: apply winners; winners "teleport", others remain. update alive_mid and last_pos.

@compute @workgroup_size(16,16)
fn move_apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * W + gid.x;

  // default carry-over from alive_in -> alive_mid
  var a = alive_in[i];

  // if someone claimed this target, set alive here
  let claim = intent[i];
  if (claim.flag == 1u) {
    a = 1u;
    // mark source as vacated only if source is alive
    let s = claim.sy * W + claim.sx;
    // clear source after winners move (only if target != source)
    if (!(claim.sx == u32(x) && claim.sy == u32(y))) {
      // source stays 0 in alive_mid; destination becomes 1 (teleport semantics)
      // we'll write source clear by ensuring carry-over below doesn't revive it
    }
    // update memory of last position for the agent now at (x,y)
    last_pos[i] = (claim.sx & 0xFFFFu) | ((claim.sy & 0xFFFFu) << 16u);
    
    // charge additional movement cost (0.05 more for successful move, total 0.1)
    let move_cost = 0.05;
    energy[s] = max(0.0, energy[s] - move_cost);
  }

  // if I was a source of a winning move, I must be cleared here.
  // detect that by checking neighbors' intents pointing to elsewhere equals my coords.
  // cheap way: trust the "teleport" overwrite: set alive_mid = a unless any neighbor won me.
  // to be safe, scan 8 neighbors for claims from me to them:
  if (alive_in[i] == 1u) {
    var moved_out: bool = false;
    for (var d: u32 = 0u; d < 8u; d = d + 1u) {
      let off = moore_dir(d);
      let j = idx(x + off.x, y + off.y);
      let c = intent[j];
      if (c.flag == 1u && c.sx == u32(x) && c.sy == u32(y)) {
        moved_out = true;
      }
    }
    if (moved_out) { a = 0u; }
  }

  alive_mid[i] = a;
}
