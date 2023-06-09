import { SelectableProperty, SourceMappedConstructor } from "thing-editor/src/editor/env";
import editable from "thing-editor/src/editor/props-editor/editable";


import DSprite from "thing-editor/src/engine/components/d-sprite.c";
import assert from "thing-editor/src/engine/debug/assert";
import game from "thing-editor/src/engine/game";
import Lib from "thing-editor/src/engine/lib";
import callByPath from "thing-editor/src/engine/utils/call-by-path";
import { mouseHandlerGlobal } from "thing-editor/src/engine/utils/game-interaction";
import getValueByPath from "thing-editor/src/engine/utils/get-value-by-path";
import Sound from "thing-editor/src/engine/utils/sound";

let latestClickTime = 0;
const SCROLL_THRESHOLD = 30;

export default class Button extends DSprite {

	callback?: () => void;

	@editable({ name: 'interactive', default: true, override: true })

	@editable({ type: 'image' })
	hoverImage = null;
	@editable({ type: 'image' })
	pressImage = null;
	@editable({ type: 'image' })
	disabledImage = null;

	@editable({ visible: (o) => { return !o.disabledImage; }, min: 0, max: 1, step: 0.01, default: 0.76 })
	disabledAlpha = 0;

	@editable({ type: 'callback', important: true })
	onClick = null;
	@editable({ type: 'callback' })
	afterClick = null;

	@editable()
	hotkey: number = 0;

	@editable({ type: 'sound' })
	sndClick = null;

	@editable({ type: 'sound' })
	sndOver = null;

	@editable()
	scrollable = false;

	initialScale!: number;
	initialImage!: string | null;

	curDelay = 0;

	@editable({ min: 0, visible: (o) => { return !o.scrollable; } })
	repeatDelay = 0;

	@editable({ min: 0, visible: (o) => { return !o.scrollable; } })
	repeatInterval = 0;

	pointerStartPos?: { x: number, y: number };

	constructor() {
		super();
		this.cursor = 'pointer';
	}

	init() {
		super.init();

		this.on('pointerdown', this.onDown);
		this.on('pointerup', this.onUp);
		this.on('pointerover', this.onOver);
		this.on('pointerout', this.onOut);

		assert(!game.__EDITOR_mode, "'init()' called in edition mode");
		assert(!allActiveButtons.has(this), "Button already in active list.");
		allActiveButtons.add(this);

		this.initialScale = this.scale.x;
		this.initialImage = this.image;
		if(this.interactive) {
			this.enable();
		} else {
			this.disable();
		}

		if(this.scrollable) {
			this.pointerStartPos = undefined;
		}
	}

	onRemove() {
		super.onRemove();
		this.onOut();

		this.removeListener('pointerdown', this.onDown);
		this.removeListener('pointerup', this.onUp);
		this.removeListener('pointerover', this.onOver);
		this.removeListener('pointerout', this.onOut);

		assert(!game.__EDITOR_mode, "'destroy()' called in edition mode");

		allActiveButtons.delete(this);

		if(downedByKeycodeButton === this) {
			downedByKeycodeButton = undefined;
		}
		this.initialImage = null;
		this.interactive = false;

		if(this.hasOwnProperty('callback')) {
			delete (this.callback);
		}
	}

	disable() {
		if(this.initialImage) {
			this.onUp();
			this.onOut();
			if(this.disabledImage) {
				this.image = this.disabledImage;
			} else {
				this.alpha = this.disabledAlpha;
			}
		}
		this.interactive = false;
	}

	enable() {
		if(this.initialImage) {
			if(this.disabledImage) {
				this.image = this.initialImage;
			} else {
				this.alpha = 1;
			}
		}
		this.interactive = true;
	}

	static clickedButton: Button | null = null;
	static overredButton: Button | null = null;
	static downedButton: Button | null = null;

	get isOvered() {
		return this === Button.overredButton;
	}

	get isDowned() {
		return this === Button.downedButton;
	}

	callClick() {
		if(this.isCanBePressed) {
			this._executeOnClick('invoke');
		}
	}

	static globalOnClick?: (b: Button, source?: string) => void;

	_executeOnClick(source/** optional tracking tag */?: string) {
		/// #if EDITOR
		if(game.__EDITOR_mode) {
			return;
		}
		/// #endif
		assert(this.isCanBePressed, "_executeOnClick called for button which could not be pressed at the moment.");

		if(Button.globalOnClick) {
			Button.globalOnClick(this, source);
		}

		Button.clickedButton = this;
		if(this.callback) {
			this.callback();
		}
		if(this.onClick) {
			callByPath(this.onClick, this);
		}
		if(this.afterClick) {
			callByPath(this.afterClick, this);
		}
		Button.clickedButton = null;

		if(this.sndClick) {
			Sound.play(this.sndClick);
		}

		latestClickTime = game.time;
	}

	onDown(ev: PointerEvent | null, source = 'pointerdown') {
		Sound._unlockSound();
		if(game.time === latestClickTime
			/// #if EDITOR
			&& !game.__paused
			/// #endif
		) {
			return;
		}
		if(ev) {
			if(ev.buttons !== 1) {
				return;
			}
			mouseHandlerGlobal(ev);
		}
		if(this.isCanBePressed && (Math.abs(latestClickTime - game.time) > 1)) {
			if(Button.downedButton !== this) {
				if(Button.downedButton) {
					Button.downedButton.onUp();
				}
				if(this.pressImage) {
					this.image = this.pressImage;
				} else {
					this.scale.x =
						this.scale.y = this.initialScale * (this.isOvered ? 1 : 0.9);
				}
				Button.downedButton = this;
				this.curDelay = this.repeatDelay
					/// #if EDITOR
					* game.__speedMultiplier
					/// #endif
					;

				if(this.scrollable) {
					this.pointerStartPos = { x: game.mouse.x, y: game.mouse.y };
				} else {
					this._executeOnClick(source);
				}
			}
		}
	}

	update() {

		/// #if EDITOR
		if(this.isCanBePressed) {
			if(this.onClick) {
				let f;
				try {
					f = getValueByPath(this.onClick, this, true);
				} catch(er) { } // eslint-disable-line no-empty
				if(typeof f !== 'function') {
					game.editor.ui.status.error('Wrong onClick handler: ' + this.onClick, 32054, this, 'onClick');
				}
			}
			if(this.afterClick) {
				if(typeof getValueByPath(this.afterClick, this, true) !== 'function') {
					game.editor.ui.status.error('Wrong afterClick handler: ' + this.afterClick, 32055, this, 'afterClick');
				}
			}
		}

		/// #endif

		if(this.isDowned) {
			if(!game.mouse.click && (downedByKeycodeButton !== this)) {
				this.onUp();
			} else if(this.curDelay > 0) {
				this.curDelay--;
				if(this.curDelay === 0) {
					if(this.isCanBePressed && (Math.abs(latestClickTime - game.time) > 1)) {
						this._executeOnClick('autorepeat');
					}
					this.curDelay = this.repeatInterval
						/// #if EDITOR
						* game.__speedMultiplier
						/// #endif
						;
				}
			}
		}
		super.update();
	}

	onUp() {
		if(Button.downedButton === this) {
			if(this.interactive) {
				if(this.pressImage) {
					if(this.initialImage) {
						this.image = this.initialImage;
					}
				} else {
					this.scale.x =
						this.scale.y = this.initialScale * (this.isOvered ? 1.05 : 1);
				}
			}
			Button.downedButton = null;

			if(this.scrollable && Math.hypot(game.mouse.x - this.pointerStartPos!.x, game.mouse.y - this.pointerStartPos!.y) <= SCROLL_THRESHOLD) {
				this._executeOnClick('pointerup');
			}
		}
	}

	onOver() {

		if(Button.overredButton !== this) {
			if(Button.overredButton) {
				Button.overredButton.onOut();
			}
			Button.overredButton = this;
			if(this.hoverImage) {
				this.image = this.hoverImage;
			} else {
				this.scale.x =
					this.scale.y = this.initialScale * 1.05;
			}

			if(this.sndOver) {
				Sound.play(this.sndOver);
			}
			this.gotoLabelRecursive('btn-over');
		}
	}

	_onDisableByTrigger() {
		this.onOut();
	}

	onOut() {
		if(Button.overredButton === this) {
			Button.overredButton = null;
			if(this.interactive) {
				if(this.hoverImage) {
					if(this.initialImage) {
						this.image = this.initialImage;
					}
				} else {
					this.scale.x =
						this.scale.y = this.initialScale;
				}
			}
			this.onUp();
			this.gotoLabelRecursive('btn-out');
		}
	}

	static _tryToClickByKeycode(keyCode: number): Button | undefined {
		for(let b of allActiveButtons) {
			if((b.hotkey === keyCode) && b.isCanBePressed) {
				b.onDown(null, 'hotkey');
				return b;
			}
		}
	}

	/// #if EDITOR
	__EDITOR_onCreate() {
		if(Lib.hasTexture('ui/button.png')) {
			this.image = 'ui/button.png';
		}
		/*if(Lib.hasSound('click')) { //TODO
			this.sndClick = 'click';
		}
		if(Lib.hasSound('over')) {
			this.sndOver = 'over';
		}*/
	}


	/// #endif

}

let downedByKeycodeButton: Button | undefined;

let allActiveButtons: Set<Button> = new Set();

window.addEventListener('keydown', (ev) => {
	if(ev.repeat) {
		return;
	}
	/// #if EDITOR
	if(game.__EDITOR_mode) {
		return;
	}
	/// #endif

	downedByKeycodeButton = Button._tryToClickByKeycode(ev.keyCode);
});

window.addEventListener('keyup', (ev) => {
	if(downedByKeycodeButton && downedByKeycodeButton.hotkey === ev.keyCode) {
		downedByKeycodeButton.onUp();
		downedByKeycodeButton = undefined;
	}
});

(Button as any as SourceMappedConstructor).__EDITOR_icon = 'tree/button';

(Button.prototype.enable as SelectableProperty).___EDITOR_isGoodForCallbackChooser = true;
(Button.prototype.disable as SelectableProperty).___EDITOR_isGoodForCallbackChooser = true;
(Button.prototype.callClick as SelectableProperty).___EDITOR_isGoodForCallbackChooser = true;

/// #endif