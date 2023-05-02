import * as PIXI from "pixi.js";
import '../../utils/assert';

import editable from "../../../editor/props-editor/editable";
import game from "../../game";

export default class Sprite extends PIXI.Sprite {

	@editable({ min: 0, max: 100, step: 1 })
	a = 0;

	@editable({ min: 0, max: 200, step: 1 })
	b = 0;

	init() {
		game.alert();
	}
}