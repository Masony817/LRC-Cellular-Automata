// messaging.wgsl
// messaging + neighborhood sensing between cells
//  - stage 0 (energy-update): decay corpse energy, deposit on death, harvest on birth
//  - stage 1 (broadcast): emit k-bit payload (default: 0), optional learned/debug
//  - stage 2 (receive): gather 8 neighbor payloads into packed inbox0; compute energy scent mask
//  - stage 3 (respond): optional second transmit (default: 0), optional learned/debug; build inbox1
//
// notes* 
//  - charge energy per set bit (countOneBits) when payload != 0 (learned modes)
//  - k in [1..4]; start with k=2
//  - modes: 0=silent, 1=debug-hash (no cost), 2=learned (read from buffers)

struct Uniforms {
  width: u32,
  height: u32,
  generation: u32,      // tick (seed for debug hash)
  k_bits: u32,          // 1..4
  cost_msg_milli: u32,  // e.g., 50 => 0.05 per bit
  mode_stage1: u32,     // 0 silent, 1 debug, 2 learned
  mode_stage3: u32,     // 0 silent, 1 debug, 2 learned
  _pad0: u32,
}
@group(0) @binding(0) var<uniform> U : Uniforms;

// core fields 
@group(0) @binding(1) var<storage, read>        alive_in     : array<u32>;  // 0/1
@group(0) @binding(2) var<storage, read_write>  energy       : array<f32>;  // >=0
@group(0) @binding(3) var<storage, read_write>  msg_out      : array<u32>;  // low k bits used
@group(0) @binding(4) var<storage, read_write>  msg_last     : array<u32>;  // memory of last payload
@group(0) @binding(5) var<storage, read_write>  inbox0       : array<u32>;  // packed 8*k bits
@group(0) @binding(6) var<storage, read_write>  inbox1       : array<u32>;  // packed 8*k bits (responses)
@group(0) @binding(7) var<storage, read_write>  energy_scent : array<u32>;  // 8-bit mask: bit d set if neighbor d has corpse E>0

// optional learned-message input buffers (one u32 per cell, low k bits are payload)
@group(0) @binding(8) var<storage, read>        learned_msg_stage1 : array<u32>;
@group(0) @binding(9) var<storage, read>        learned_msg_stage3 : array<u32>;

// corpse energy and last-alive tracking
//  - dead_energy: energy residue stored at dead cells; decays by 0.02 per generation
//  - alive_prev:  previous tick's alive flag to detect birth/death transitions
@group(0) @binding(10) var<storage, read_write> dead_energy  : array<f32>;
@group(0) @binding(11) var<storage, read_write> alive_prev   : array<u32>;

// ----- helpers -----

fn idx(col: i32, row: i32) -> u32 {
  let W = i32(U.width);
  let H = i32(U.height);
  let x = ((col % W) + W) % W;
  let y = ((row % H) + H) % H;
  return u32(y) * U.width + u32(x);
}

fn moore_dir(d: u32) -> vec2<i32> {
  // d = 0..7: nw, n, ne, w, e, sw, s, se
  switch(d) {
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

fn mask_k() -> u32 {
  return (1u << U.k_bits) - 1u;
}

fn hash3(x: u32, y: u32, t: u32) -> u32 {
  // simple 3-input mix for debug mode
  var h = x * 374761393u ^ y * 668265263u ^ t * 2246822519u;
  h ^= (h >> 13u); h *= 1274126177u; h ^= (h >> 16u);
  return h;
}

// pack/unpack 8 neighbor payloads (each k bits) into u32
fn pack_inbox(bits: array<u32,8>) -> u32 {
  var acc: u32 = 0u;
  let k = U.k_bits;
  let m = mask_k();
  for (var d: u32 = 0u; d < 8u; d = d + 1u) {
    acc = acc | ((bits[d] & m) << (d * k));
  }
  return acc;
}

fn unpack_dir(inbox: u32, dir: u32) -> u32 {
  let k = U.k_bits;
  return (inbox >> (dir * k)) & mask_k();
}

// energy charge for payload (per set bit)
fn charge_for_payload(i: u32, payload: u32) {
  if (payload == 0u) { return; }
  let ones = f32(countOneBits(payload & mask_k()));
  let cost = ones * (f32(U.cost_msg_milli) * 0.001);
  energy[i] = max(0.0, energy[i] - cost);
}

// ----- stage 0: corpse energy update (decay, deposit on death, harvest on birth) -----

@compute @workgroup_size(16,16)
fn msg_stage0_energy_update(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let i = gid.y * U.width + gid.x;

  // decay corpse energy linearly by 0.02 per generation, clamp to >= 0
  let decayed = max(0.0, dead_energy[i] - 0.02);
  dead_energy[i] = decayed;

  let was_alive = alive_prev[i];
  let is_alive  = alive_in[i];

  // death: deposit remaining energy as corpse energy and clear live energy
  if (was_alive == 1u && is_alive == 0u) {
    dead_energy[i] = energy[i];
    energy[i] = 0.0;
  }

  // birth/move into cell: harvest corpse energy into live energy
  if (was_alive == 0u && is_alive == 1u) {
    energy[i] = energy[i] + dead_energy[i];
    dead_energy[i] = 0.0;
  }

  // update previous alive state for next tick
  alive_prev[i] = is_alive;
}

//stage 1: broadcast 

@compute @workgroup_size(16,16)
fn msg_stage1_broadcast(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let i = gid.y * U.width + gid.x;

  if (alive_in[i] == 0u) {
    msg_out[i] = 0u;
    // msg_last unchanged on death here; can zero it elsewhere 
    return;
  }

  var payload: u32 = 0u;

  switch (U.mode_stage1) {
    case 0u: { // silent (default)
      payload = 0u;
    }
    case 1u: { // debug hash (no cost, purely for plumbing )
      let h = hash3(gid.x, gid.y, U.generation);
      payload = h & mask_k();
    }
    default: { // 2 = learned (read from buffer)
      payload = learned_msg_stage1[i] & mask_k();
    }
  }

  // charge energy only if payload != 0 and NOT in debug mode
  if (U.mode_stage1 == 2u) {
    charge_for_payload(i, payload);
  }

  msg_out[i]  = payload;
  msg_last[i] = payload; // keep latest sent
}

// stage 2: receive + energy scent (8-bit neighbor mask)

@compute @workgroup_size(16,16)
fn msg_stage2_receive(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * U.width + gid.x;

  // gather 8 neighbor payloads from msg_out
  var neigh: array<u32,8>;
  for (var d: u32 = 0u; d < 8u; d = d + 1u) {
    let off = moore_dir(d);
    let j = idx(x + off.x, y + off.y);
    neigh[d] = msg_out[j] & mask_k();
  }
  inbox0[i] = pack_inbox(neigh);

  // energy scent: per-direction bit set if neighbor has corpse energy > 0
  var scent_mask: u32 = 0u;
  for (var d2: u32 = 0u; d2 < 8u; d2 = d2 + 1u) {
    let off2 = moore_dir(d2);
    let j2 = idx(x + off2.x, y + off2.y);
    if (dead_energy[j2] > 0.0) {
      scent_mask = scent_mask | (1u << d2);
    }
  }
  energy_scent[i] = scent_mask;
}

// stage 3: respond (optional) + inbox1 

// stage 3a: compute replies and write to msg_out
@compute @workgroup_size(16,16)
fn msg_stage3a_respond(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let i = gid.y * U.width + gid.x;

  var reply: u32 = 0u;
  if (alive_in[i] == 1u) {
    switch (U.mode_stage3) {
      case 0u: { // silent (default)
        reply = 0u;
      }
      case 1u: { // debug hash (different phase salt), no cost
        let h = hash3(gid.x ^ 0x9e3779b9u, gid.y ^ 0x7f4a7c15u, U.generation ^ 0x85ebca6bu);
        reply = h & mask_k();
      }
      default: { // 2 = learned
        reply = learned_msg_stage3[i] & mask_k();
      }
    }
    if (U.mode_stage3 == 2u) {
      charge_for_payload(i, reply);
    }
  }

  // overwrite msg_out with response so immediate neighbors can read it this same tick
  msg_out[i] = reply;
}

// stage 3b: build inbox1 from neighbors' replies
@compute @workgroup_size(16,16)
fn msg_stage3b_pack(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * U.width + gid.x;

  var neigh: array<u32,8>;
  for (var d: u32 = 0u; d < 8u; d = d + 1u) {
    let off = moore_dir(d);
    let j = idx(x + off.x, y + off.y);
    neigh[d] = msg_out[j] & mask_k();
  }
  inbox1[i] = pack_inbox(neigh);
}


