import { OutlineFilter } from "@pixi/filter-outline";
import { Container } from "pixi.js";

const highlightFilter = new OutlineFilter(3, 0xff0000);

const highlightObject = (o: Container) => {
	if(!o.filters || o.filters.indexOf(highlightFilter) < 0) {
		o.addFilter(highlightFilter);
		setTimeout(() => {
			o.removeFilter(highlightFilter);
		}, 100);
		setTimeout(() => {
			o.addFilter(highlightFilter);
		}, 200);
		setTimeout(() => {
			o.removeFilter(highlightFilter);
		}, 300);
	}
};

export default highlightObject;