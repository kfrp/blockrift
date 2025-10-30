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

      // Add click handler for each item
      const index = i;
      this.items[i]?.addEventListener("click", () => {
        this.onItemClick(index);
      });
    }
    document.body.appendChild(this.bag);
  }

  current = 0;
  icon = [wood, glass, grass, stone, tree, diamond, quartz, coal];
  iconIndex = 0;
  y = 0;
  onSelectCallback?: (index: number) => void;

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

  /**
   * Update the selected item in the bag UI
   * Called by Control class when holdingIndex changes
   */
  updateSelection(index: number) {
    if (isMobile) return;

    // Remove selection from all items
    for (let i = 0; i < this.items.length; i++) {
      this.items[i]!.classList.remove("selected");
    }

    // Add selection to the new index
    this.current = index;
    if (this.items[this.current]) {
      this.items[this.current]!.classList.add("selected");
    }
  }

  /**
   * Set callback for when an item is clicked
   */
  setOnSelectCallback(callback: (index: number) => void) {
    this.onSelectCallback = callback;
  }

  /**
   * Handle item click
   */
  private onItemClick(index: number) {
    if (this.onSelectCallback) {
      this.onSelectCallback(index);
    }
  }
}
