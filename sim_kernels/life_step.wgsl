// standard Conway's Game of Life compute shader
// each invocation processes one grid cell

// grid dimensions uniforms
struct Uniforms{
    width: u32,
    height: u32,
    generation: u32,
    _padding: u32,
}

@group(0) @binding(2) var<uniform> U: Uniforms;

@group(0) @binding(0) var<storage, read> alive_mid: array<u32>; // after movement pass
@group(0) @binding(1) var<storage, read_write> alive_next: array<u32>; // for energy post-life pass

fn idx(col: i32, row: i32) -> u32 {
    // get index with toroidal wrapping
    let W = i32(U.width);
    let H = i32(U.height);
    let x = ( (col % W) + W ) % W;
    let y = ( (row % H) + H ) % H;
    return u32(y) * U.width + u32(x);
}


// count live neighbors (Moore neighborhood)
fn count_neighbors(x: i32, y: i32) -> u32 {
    var count = 0u;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) { continue; }
      count += alive_mid[idx(x + dx, y + dy)];
    }
  }
  return count;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= U.width || gid.y >= U.height) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let i = gid.y * U.width + gid.x;

  let current = alive_mid[i]; // current state
  let neighbors = count_neighbors(x, y); // count live neighbors
  
  var next: u32 = 0u;
  // apply Conway's Game of Life rules
  if (current == 1u) {
    if (neighbors == 2u || neighbors == 3u) { next = 1u; }
  } else {
    if (neighbors == 3u) { next = 1u; }
  }
  
  alive_next[i] = next;
}