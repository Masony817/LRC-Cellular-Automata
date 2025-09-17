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

// Intent surface replaced with atomic winner hash per target cell
// Each proposer computes a 32-bit hash h and does atomicMax to claim target.
// Apply pass reconstructs source by scanning 8 neighbors and matching h.
@group(0) @binding(7) var<storage, read_write> intent_hash : array<atomic<u32>>;
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

//  step 0: clear intent hashes (must be run before propose)

@compute @workgroup_size(16,16)
fn move_clear_intents(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let i = gid.y * W + gid.x;
  atomicStore(&intent_hash[i], 0u);
}

//  step 1: propose (winner = max hash) and charge energy for attempting a move.

@compute @workgroup_size(16,16)
fn move_propose(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * W + gid.x;

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
        let attempt_cost = (f32(U.cost_move_milli) * 0.001) * 0.5;
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

  // compute tie-break hash (higher wins) and claim target via atomicMax
  let h = rand_hash3(u32(x) ^ 0x9e3779b9u, u32(y) ^ 0x7f4a7c15u, U.generation);
  let _prev = atomicMax(&intent_hash[tgt_idx], h);

  // charge movement attempt cost (half of total move cost)
  let attempt_cost = (f32(U.cost_move_milli) * 0.001) * 0.5;
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

  // arrival: if a winner hash exists at this target, set alive and charge source
  let wh = atomicLoad(&intent_hash[i]);
  if (wh != 0u) {
    a = 1u;
    // reconstruct source by scanning 8 neighbors and matching hash & target
    var src_found = false;
    var srcx: u32 = u32(x);
    var srcy: u32 = u32(y);
    for (var d: u32 = 0u; d < 8u; d = d + 1u) {
      let offn = moore_dir(d);
      let sx = i32(x) + offn.x;
      let sy = i32(y) + offn.y;
      let s_idx = idx(sx, sy);
      if (alive_in[s_idx] == 0u) { continue; }
      // decide if this neighbor would target (x,y)
      // rebuild empty dirs from neighbor's perspective
      var empty_dirs_n: array<u32,8>;
      var n_empty_n: u32 = 0u;
      for (var dn: u32 = 0u; dn < 8u; dn = dn + 1u) {
        let off_scan = moore_dir(dn);
        let jn = idx(sx + off_scan.x, sy + off_scan.y);
        if (alive_in[jn] == 0u) {
          empty_dirs_n[n_empty_n] = dn;
          n_empty_n = n_empty_n + 1u;
        }
      }
      var targets_me = false;
      switch (U.movement_mode) {
        case 1u: {
          let act = ppo_actions[s_idx] % 9u;
          if (act != 8u) {
            let offa = moore_dir(act);
            let ja = idx(sx + offa.x, sy + offa.y);
            if (ja == i) { targets_me = true; }
          }
        }
        default: {
          if (n_empty_n != 0u) {
            let seedn = rand_hash3(u32(sx), u32(sy), U.generation);
            let dsel = empty_dirs_n[seedn % n_empty_n];
            let offsel = moore_dir(dsel);
            let jsel = idx(sx + offsel.x, sy + offsel.y);
            if (jsel == i) { targets_me = true; }
          }
        }
      }
      if (!targets_me) { continue; }
      let hcand = rand_hash3(u32(sx) ^ 0x9e3779b9u, u32(sy) ^ 0x7f4a7c15u, U.generation);
      if (hcand == wh) {
        src_found = true;
        srcx = u32(sx);
        srcy = u32(sy);
        let slinear = u32(sy) * W + u32(sx);
        let move_cost = (f32(U.cost_move_milli) * 0.001) * 0.5;
        energy[slinear] = max(0.0, energy[slinear] - move_cost);
        break;
      }
    }
    // update memory of last position for the agent now at (x,y)
    last_pos[i] = (srcx & 0xFFFFu) | ((srcy & 0xFFFFu) << 16u);
  }

  // departure: if I won a move to my chosen target, clear my cell
  if (alive_in[i] == 1u) {
    // rebuild empty dirs from my perspective
    var empty_dirs: array<u32,8>;
    var n_empty: u32 = 0u;
    for (var d2: u32 = 0u; d2 < 8u; d2 = d2 + 1u) {
      let off2 = moore_dir(d2);
      let j2 = idx(x + off2.x, y + off2.y);
      if (alive_in[j2] == 0u) {
        empty_dirs[n_empty] = d2;
        n_empty = n_empty + 1u;
      }
    }
    var moved_out = false;
    switch (U.movement_mode) {
      case 1u: {
        let act = ppo_actions[i] % 9u;
        if (act != 8u) {
          let offa = moore_dir(act);
          let j = idx(x + offa.x, y + offa.y);
          let myh = rand_hash3(u32(x) ^ 0x9e3779b9u, u32(y) ^ 0x7f4a7c15u, U.generation);
          if (atomicLoad(&intent_hash[j]) == myh) { moved_out = true; }
        }
      }
      default: {
        if (n_empty != 0u) {
          let seed = rand_hash3(u32(x), u32(y), U.generation);
          let dsel = empty_dirs[seed % n_empty];
          let offsel = moore_dir(dsel);
          let j = idx(x + offsel.x, y + offsel.y);
          let myh = rand_hash3(u32(x) ^ 0x9e3779b9u, u32(y) ^ 0x7f4a7c15u, U.generation);
          if (atomicLoad(&intent_hash[j]) == myh) { moved_out = true; }
        }
      }
    }
    if (moved_out) { a = 0u; }
  }

  alive_mid[i] = a;
}
