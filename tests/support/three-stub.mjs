// Minimal stand-in for the parts of three.js that the game logic touches, so combat/AI can be unit-tested in Node.
class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
export class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } set(a) { this.array.set(a); } }
export class Float32BufferAttribute extends BufferAttribute { constructor(a, s) { super(new Float32Array(a), s); } }
export class Uint16BufferAttribute extends BufferAttribute { constructor(a, s) { super(new Uint16Array(a), s); } }
export class Uint32BufferAttribute extends BufferAttribute { constructor(a, s) { super(new Uint32Array(a), s); } }
export class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } setIndex(i) { this.index = i; } dispose() {} }
export class Object3D { constructor() { this.position = new Vec(); this.children = []; this.visible = true; } add(...c) { this.children.push(...c); } remove(c) { this.children = this.children.filter((x) => x !== c); } traverse(f) { f(this); this.children.forEach((c) => c.traverse(f)); } }
export class Group extends Object3D {}
export class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
export class MeshBasicMaterial { constructor(o) { Object.assign(this, o); } }
export const DoubleSide = 2;
