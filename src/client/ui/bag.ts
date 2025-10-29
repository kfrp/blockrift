import grass from "../assets/block-icon/grass.png";
import stone from "../assets/block-icon/stone.png";
import tree from "../assets/block-icon/tree.png";
import wood from "../assets/block-icon/wood.png";
import diamond from "../assets/block-icon/diamond.png";
import quartz from "../assets/block-icon/quartz.png";
import glass from "../assets/block-icon/glass.png";
import coal from "../assets/block-icon/coal.png";
import { isMobile } from "../utils/utils";

export default class Bag {
  constructor() {
    if (isMobile) return;

    this.bag.className = "bag";
    this.items[0]?.classList.add("selected");

    for (let i = 0; i < this.items.length; i++) {
      this.bag.appendChild(this.items[i] as Node);
    }
    document.body.appendChild(this.bag);

    document.body.addEventListener("keydown", (e: KeyboardEvent) => {
      if (isNaN(parseInt(e.key)) || e.key === "0" || parseInt(e.key) > 8) {
        return;
      }

      for (let i = 0; i < this.items.length; i++) {
        this.items[i]!.classList.remove("selected");
      }

      this.current = parseInt(e.key) - 1;
      this.items[this.current]!.classList.add("selected");
    });

    document.body.addEventListener("wheel", (e: WheelEvent) => {
      if (!this.wheelGap) {
        this.wheelGap = true;
        setTimeout(() => {
          this.wheelGap = false;
        }, 100);
        if (e.deltaY > 0) {
          this.current++;
          this.current > 9 && (this.current = 0);
        } else if (e.deltaY < 0) {
          this.current--;
          this.current < 0 && (this.current = 9);
        }
        for (let i = 0; i < this.items.length; i++) {
          this.items[i]!.classList.remove("selected");
        }
        this.items[this.current]!.classList.add("selected");
      }
    });
  }
  wheelGap = false;
  current = 0;
  icon = [wood, glass, grass, stone, tree, diamond, quartz, coal];
  iconIndex = 0;
  y = 0;

  bag = document.createElement("div");

  items = new Array(8).fill(null).map(() => {
    let item = document.createElement("div");
    item.className = "item";

    let img = document.createElement("img");
    if (this.icon[this.iconIndex]) {
      img.className = "icon";
      img.alt = "block";
      img.src = this.icon[this.iconIndex++]!;
      item.appendChild(img);
    }

    return item;
  });
}
