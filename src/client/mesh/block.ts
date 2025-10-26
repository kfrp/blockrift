import { BlockType } from "../terrain/index";

/**
 * Custom block
 */
export default class Block {
  object: any;
  constructor(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    placed: boolean,
    username: string = "",
    timestamp: number = Date.now()
  ) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.type = type;
    this.placed = placed;
    this.username = username;
    this.timestamp = timestamp;
  }
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placed: boolean;
  username: string;
  timestamp: number;
}
