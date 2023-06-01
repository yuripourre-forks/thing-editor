import { SourceMappedConstructor } from "thing-editor/src/editor/env";
import fs from "thing-editor/src/editor/fs";


const getPropertyDefinitionUrl = (fileName: string, fieldName: string, Class: SourceMappedConstructor): string => {
	if(!Class.__sourceCode) {
		Class.__sourceCode = fs.readFile(fileName).split('\n');
	}

	const src = Class.__sourceCode;

	let fieldRegExp1 = new RegExp('\\s*((set|get)\\s+)*' + fieldName + '[\\s=;:\\(]');
	let fieldRegExp2 = new RegExp('_editableEmbed\\(\\S+,\\s*[\'"`]' + fieldName + '[\'"`]');
	src.some((line, i) => {
		var match = fieldRegExp1.exec(line);
		if(match) {
			if(i > 0 && src[i - 1].indexOf('@editable(') >= 0) {
				fileName += ':' + (i + 1) + ':' + (match.index + 1);
				return true;
			}
		}
		match = fieldRegExp2.exec(line);
		if(match) {
			fileName += ':' + (i + 1) + ':' + (match.index + 1);
			return true;
		}
	});

	return fileName;
}

const clearPropertyDifinitionCache = (Class: SourceMappedConstructor) => {
	Class.__sourceCode = undefined;
}

export { getPropertyDefinitionUrl, clearPropertyDifinitionCache };
