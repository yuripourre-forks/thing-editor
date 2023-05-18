import { ClassAttributes, Component, ComponentChild } from "preact";
import R from "thing-editor/src/editor/preact-fabrics";
import game from "thing-editor/src/engine/game";

let modalRejectProps = { className: 'modal-reject-text' };

interface PromptProps extends ClassAttributes<Prompt> {
	defaultText?: string;
	filter?: (val: string) => string;
	accept?: (val: string) => string | undefined;
	multiline?: boolean;
	/** accept button tool tip */
	title?: string
}

interface PromptState {
	value: string;
	rejectReason?: ComponentChild;
	accepted?: boolean;

}

export default class Prompt extends Component<PromptProps, PromptState> {

	constructor(props: PromptProps) {
		super(props);
		this.state = { value: props.defaultText || '' };
		this.onChange = this.onChange.bind(this);
		this.onAcceptClick = this.onAcceptClick.bind(this);
		this.onKeyDown = this.onKeyDown.bind(this);
	}

	componentDidMount() {
		setTimeout(() => {
			let input = document.querySelector('.modal-content input') as HTMLInputElement;
			if(input) {
				try {
					input.focus();
					input.setSelectionRange(0, input.value.length);
				} catch(er) { } // eslint-disable-line no-empty
			}
		}, 1);
		this.checkAcceptance(this.state.value);
	}

	onChange(ev: InputEvent) {
		let val = this.props.filter ? this.props.filter((ev.target as HTMLInputElement).value) : (ev.target as HTMLInputElement).value;
		this.checkAcceptance(val);
	}

	checkAcceptance(val: string) {
		let reject = this.props.accept ? this.props.accept(val) : undefined;
		this.setState({
			value: val,
			rejectReason: reject,
			accepted: (val && !reject) as boolean
		});
	}

	onKeyDown(ev: KeyboardEvent) {
		if(ev.keyCode === 13 && !this.props.multiline) {
			this.onAcceptClick();
		}
	}

	onAcceptClick() {
		if(this.state.accepted) {
			game.editor.ui.modal.hideModal(this.state.value);
		}
	}

	render() {
		let input = (this.props.multiline ? R.textarea : R.input);
		return R.fragment(
			R.div(modalRejectProps, this.state.rejectReason || ' '),
			R.div({ className: 'prompt-dialogue' },
				input({ value: this.state.value, onKeyDown: this.onKeyDown, onInput: this.onChange })
			),
			R.btn('Ok', this.onAcceptClick, this.props.title, 'main-btn', this.props.multiline ? undefined : 13)
		);
	}
}