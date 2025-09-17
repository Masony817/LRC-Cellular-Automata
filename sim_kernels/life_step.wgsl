// standard Conway's Game of Life compute shader
// each invocation processes one grid cell

@group(0) @binding(0) var<storage, read> current_state: array<u32>;
@group(0) @binding(1) var<storage, read_write> next_state: array<u32>;

// grid dimensions uniforms
struct Uniforms{
    width: u32,
    height: u32,
    generation: u32,
    _padding: u32,
}

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// 2D cell coordinates to 1D array index
fn get_index(col: u32, row: u32) -> u32 {
    return row * uniforms.width + col;
}

// get cell state with toroidal wrapping
fn get_cell(col: i32, row: i32) -> u32 {
    let w = i32(uniforms.width);
    let h = i32(uniforms.height);

    var c = col;
    var r = row;

    // single-step wrap (neighbors only differ by ±1)
    if (c < 0) { c = c + w; }
    if (c >= w) { c = c - w; }
    if (r < 0) { r = r + h; }
    if (r >= h) { r = r - h; }

    return current_state[get_index(u32(c), u32(r))];
}

// count live neighbors (Moore neighborhood)
fn count_neighbors(col: u32, row: u32) -> u32 {
    let col_i = i32(col);
    let row_i = i32(row);

    var count = 0u;

    count += get_cell(col_i - 1, row_i - 1);
    count += get_cell(col_i    , row_i - 1);
    count += get_cell(col_i + 1, row_i - 1);
    count += get_cell(col_i - 1, row_i    );
    count += get_cell(col_i + 1, row_i    );
    count += get_cell(col_i - 1, row_i + 1);
    count += get_cell(col_i    , row_i + 1);
    count += get_cell(col_i + 1, row_i + 1);

    return count;
}

fn apply_rules(current: u32, neighbors_count: u32) -> u32 {
    if (current == 1u) {
        // live cell survives with 2 or 3 neighbors
        if (neighbors_count == 2u || neighbors_count == 3u) {
            return 1u;
        } else {
            return 0u;
        }
    } else {
        // dead cell becomes alive with exactly 3 neighbors
        if (neighbors_count == 3u) {
            return 1u;
        } else {
            return 0u;
        }
    }
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let col = global_id.x;
    let row = global_id.y;

    if (col >= uniforms.width || row >= uniforms.height) {
        return;
    }

    let index = get_index(col, row);
    let current = current_state[index];
    let neighbors_count = count_neighbors(col, row);

    next_state[index] = apply_rules(current, neighbors_count);
}