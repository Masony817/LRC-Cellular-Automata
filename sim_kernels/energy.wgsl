// energy.wgsl
// Pass A: diffuse + leak + add sources; energy already debited by messaging/movement
// Pass B (post-Life): enforce energy death, harvest corpse energy on birth, cap to 1, deposit to corpse on death, update age

struct Uniforms {
  width: u32,
  height: u32,
  generation: u32,
  leak_milli: u32,     // e.g., 20 = 0.02
  diff_milli: u32,     // e.g., 300 = 0.3
  decay_milli: u32,    // corpse energy linear decay per tick, e.g., 20 = 0.02
}
@group(0) @binding(0) var<uniform> U : Uniforms;

@group(0) @binding(1) var<storage, read>      energy_src  : array<f32>;   // energy(t)
@group(0) @binding(2) var<storage, read_write> energy_dst : array<f32>;   // energy(t+1)
@group(0) @binding(3) var<storage, read>      source_map  : array<f32>;   // exogenous S (paintable)
@group(0) @binding(4) var<storage, read>      alive_mid  : array<u32>;   // before Life
@group(0) @binding(5) var<storage, read_write> alive_next : array<u32>;   // after Life (write by Life pass)
@group(0) @binding(6) var<storage, read_write> age_in     : array<u32>;
@group(0) @binding(7) var<storage, read_write> age_out    : array<u32>;
@group(0) @binding(10) var<storage, read_write> dead_energy: array<f32>;   // corpse energy per cell (shared index)

// --- helpers ---

fn idx(col: i32, row: i32) -> u32 {
  let W = i32(U.width);
  let H = i32(U.height);
  let x = ( (col % W) + W ) % W;
  let y = ( (row % H) + H ) % H;
  return u32(y) * U.width + u32(x);
}

fn laplacian(E: ptr<storage, array<f32>, read>, W: u32, H: u32, x: i32, y: i32) -> f32 {
  let c  = (*E)[idx(x, y)];
  let n  = (*E)[idx(x, y-1)];
  let s  = (*E)[idx(x, y+1)];
  let w  = (*E)[idx(x-1, y)];
  let e  = (*E)[idx(x+1, y)];
  return (n + s + w + e) - 4.0 * c;
}

// --- Pass A: diffusion/leak/source ---

@compute @workgroup_size(16,16)
fn energy_diffuse(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * W + gid.x;

  let E = energy_src[i];
  let L = f32(U.leak_milli) * 0.001;
  let D = f32(U.diff_milli) * 0.001;
  let lap = laplacian(&energy_src, W, H, x, y);
  var e_next = (1.0 - L) * E + D * lap + source_map[i];

  if (e_next < 0.0) { e_next = 0.0; }
  energy_dst[i] = e_next;
}

// --- Pass B: post-Life enforcement & spill ---

@compute @workgroup_size(16,16)
fn energy_post_life(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = U.width;
  let H = U.height;
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * W + gid.x;

  // decay corpse energy linearly per tick
  let decay = f32(U.decay_milli) * 0.001;
  dead_energy[i] = max(0.0, dead_energy[i] - decay);

  // Read current alive states
  let a_prev = alive_mid[i];
  var a_next = alive_next[i];

  // Enforce: if energy == 0 -> die regardless of Life rules
  var e = energy_dst[i];
  if (a_next == 1u && e <= 0.0) {
    a_next = 0u;
  }

  // Birth handling: if born now (0 -> 1), set energy to exactly 1.0
  if (a_prev == 0u && a_next == 1u) {
    // harvest corpse energy at this cell and cap to 1.0
    e = min(1.0, e + dead_energy[i]);
    dead_energy[i] = 0.0;
    age_out[i] = 0u;
  } else if (a_next == 1u) {
    // Survivor: cap to 1.0, age++
    e = min(e, 1.0);
    age_out[i] = age_in[i] + 1u;
  } else {
    // Dead: deposit remaining energy into corpse pool at this cell; no neighbor writes
    if (e > 0.0) {
      dead_energy[i] = dead_energy[i] + e;
    }
    e = 0.0;
    age_out[i] = 0u;
  }

  alive_next[i] = a_next;
  energy_dst[i] = e;
}
