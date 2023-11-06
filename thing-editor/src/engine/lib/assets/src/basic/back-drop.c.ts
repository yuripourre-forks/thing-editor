import { Point, Renderer } from "pixi.js";
import type { SerializedObject } from "thing-editor/src/editor/env";
import game from "thing-editor/src/engine/game";
import Shape from "thing-editor/src/engine/lib/assets/src/extended/shape.c";

const zeroPoint = new Point();
const sizePoint = new Point();

export default class BackDrop extends Shape {

	/// #if EDITOR
	__afterSerialization(data: SerializedObject): void {
		delete data.p.width;
		delete data.p.height;
		delete data.p.x;
		delete data.p.y;
	}

	/// #endif

	render(renderer: Renderer): void {
		try {
			this.parent.toLocal(zeroPoint, game.stage, this, false);
		} catch(_er) { /* empty */ }
		sizePoint.x = game.W;
		sizePoint.y = game.H;
		this.toLocal(sizePoint, game.stage, sizePoint, false);
		this.updateTransform();
		this.width = sizePoint.x;
		this.height = sizePoint.y;
		super.render(renderer);
	}
}