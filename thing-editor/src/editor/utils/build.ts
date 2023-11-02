import { AssetsDescriptor, KeyedMap, KeyedObject, SerializedObject, SoundAssetEntry, SourceMappedConstructor } from "thing-editor/src/editor/env";
import fs, { AssetType, FileDesc, FileDescClass, FileDescImage, FileDescPrefab, FileDescScene, FileDescSound } from "thing-editor/src/editor/fs";
import R from "thing-editor/src/editor/preact-fabrics";
import enumAssetsPropsRecursive from "thing-editor/src/editor/utils/enum-assets-recursive";
import getHashedAssetName from "thing-editor/src/editor/utils/get-hashed-asset-name";
import game, { DEFAULT_FADER_NAME, PRELOADER_SCENE_NAME } from "thing-editor/src/engine/game";
import Lib, { isAtlasAsset } from "thing-editor/src/engine/lib";


let prefixToCutOff: '___' | '__';

function isFileNameValidForBuild(name: string) {
	return !name.startsWith(prefixToCutOff) && (name.indexOf('/' + prefixToCutOff) < 0);
}

function filterAssets(file: FileDesc) {
	return isFileNameValidForBuild(file.assetName);
}

const filterChildrenByName = (childData: SerializedObject) => {
	if(!childData.hasOwnProperty('p')) {
		return true;
	}
	if(childData.p.hasOwnProperty('name') &&
		childData.p.name.startsWith(prefixToCutOff)) {
		return false;
	}
	if(childData.p.hasOwnProperty('prefabName') &&
		!isFileNameValidForBuild(childData.p.prefabName)) {
		return false;
	}
	return true;
};

const fieldsFilter = (key: string, value: any) => {
	if(!key.startsWith(prefixToCutOff)) {
		if(key === ':' && Array.isArray(value)) { // cut off __ objects
			return value.filter(filterChildrenByName);
		}
		return value;
	}
	if(typeof value === 'object') { //its prefab or scene data
		if(isFileNameValidForBuild(key)) {
			return value;
		}
	}
};

function getAssetsForBuild(type: AssetType.CLASS): FileDescClass[];
function getAssetsForBuild(type: AssetType.SOUND): FileDescSound[];
function getAssetsForBuild(type: AssetType.IMAGE): FileDescImage[];
function getAssetsForBuild(type: AssetType.PREFAB): FileDescPrefab[];
function getAssetsForBuild(type: AssetType.SCENE): FileDescScene[];
function getAssetsForBuild(type: AssetType) {
	return fs.getAssetsList(type).filter(filterAssets);
}

let currentBuildIsDebug = false;

let assetsToCopy: { from: string, to: string; }[] = [];

export default class Build {
	static build(debug: boolean) {

		game.editor.validateResources();

		currentBuildIsDebug = debug;

		assetsToCopy = [];

		if(game.editor.askSceneToSaveIfNeed() === false) {
			return;
		}
		game.editor.ui.modal.showSpinner();

		prefixToCutOff = (debug ? '___' : '__');

		const preloaderAssets: Set<FileDesc> = new Set();
		preloaderAssets.add(fs.getFileByAssetName(PRELOADER_SCENE_NAME, AssetType.SCENE));
		preloaderAssets.add(fs.getFileByAssetName(DEFAULT_FADER_NAME, AssetType.PREFAB));
		enumAssetsPropsRecursive(Lib.scenes[PRELOADER_SCENE_NAME], preloaderAssets);

		const text = game.editor.projectDesc.embedLocales ?
			game.editor.LanguageView.__getTextAssets()
			:
			undefined;

		///////////////////////////////////////////////////////////
		/// assets-preloader.json ////////////////////////////////
		/////////////////////////////////////////////////////////
		saveAssetsDescriptor(preloaderAssets, 'assets-preloader.json', game.projectDesc, text);

		const mainAssets: Set<FileDesc> = new Set();
		const allAssets = fs.getAssetsList();
		for(let asset of allAssets) {
			if(!preloaderAssets.has(asset)) {
				mainAssets.add(asset);
			}
		}

		///////////////////////////////////////////////////////////
		/// assets-main.json /////////////////////////////////////
		/////////////////////////////////////////////////////////
		saveAssetsDescriptor(mainAssets, 'assets-main.json');

		let scenesFiles = getAssetsForBuild(AssetType.SCENE);
		let prefabsFiles = getAssetsForBuild(AssetType.PREFAB);
		let classesFiles = getAssetsForBuild(AssetType.CLASS) as FileDescClass[];

		classesFiles.sort((a, b) => {
			if(a.assetName > b.assetName) {
				return 1;
			} else if(a.assetName < b.assetName) {
				return -1;
			}
			return 0;
		});

		let src = [`/* this file is generated by thing-editor.
	Please do not modify it. Any changes will be overridden anyway.*/

	import { KeyedObject, SourceMappedConstructor } from "thing-editor/src/editor/env";
	import Lib from "thing-editor/src/engine/lib";
	const classes:KeyedObject = {};`];

		const findRef = (class_: SourceMappedConstructor): boolean => {
			let name = class_.__className;
			if(findClassNameInAssetFiles(name, scenesFiles) || findClassNameInAssetFiles(name, prefabsFiles)) {
				return true;
			}
			return classesFiles.some((c: FileDescClass) => {
				return (c.asset.prototype instanceof class_) && findRef(c.asset.prototype.constructor as SourceMappedConstructor);
			});
		};

		classesFiles = classesFiles.filter(f => findRef(f.asset));

		for(const classFile of classesFiles) {
			if(classFile.asset.__requiredComponents) {
				for(const requiredClass of classFile.asset.__requiredComponents) {
					if(!requiredClass.__classAsset) {
						game.editor.ui.status.warn(classFile.asset.__className + '.__requiredComponents contains wrong component: ' + (requiredClass.name || requiredClass));
					} else {
						if(classesFiles.indexOf(requiredClass.__classAsset) < 0) {
							classesFiles.push(requiredClass.__classAsset);
						}
					}
				}
			}
		}

		for(let classFile of classesFiles) {
			let name = classFile.asset.__className;
			let path = classFile.fileName;

			if(path.startsWith('/')) {
				path = path.substr(1);
			}
			src.push('import ' + name + ' from "' + path + '";');
			src.push('classes["' + name + '"] = ' + name + ';');
			src.push(name + '.__defaultValues = ' + JSON.stringify(classFile.asset.__defaultValues, fieldsFilter) + ';');
		}

		src.push('Lib._setClasses(classes);');
		fs.writeFile(game.editor.currentProjectDir + '.tmp/classes.ts', src.join('\n'));

		const reversedDirsList = game.editor.assetsFolders.slice().reverse();

		for(let dir of reversedDirsList) {
			const htmlName = dir + 'index.html';
			if(fs.exists(htmlName)) {
				fs.copyFile(htmlName, game.editor.currentProjectDir + '.tmp/index.html');
				break;
			}
		}

		fs.build(game.editor.currentProjectDir, debug, assetsToCopy).then((result: any) => {
			game.editor.ui.modal.hideSpinner();
			if(!game.editor.buildProjectAndExit) {
				if(result instanceof Error) {
					const a = result.message.split('\n');
					const b = (a[1] as string).split(':');
					const i = b.findIndex(t => t.indexOf('ERROR') >= 0);
					const lineNum = b[i - 2];
					const charNum = b[i - 1];
					b.length = i - 2;
					const fileName = b.join(':');

					game.editor.editSource(fileName, lineNum, charNum, true);

					game.editor.ui.modal.showError(renderTextWithFilesLinks(result.message), 99999, 'Build error!');
				} else {
					let url = game.editor.currentProjectDir + (currentBuildIsDebug ? 'debug/' : 'release/');
					game.editor.openUrl('http://localhost:5174/' + url);
					game.editor.ui.modal.showModal("Builded successfully.");
				}
			}
		});
	}
}

function findClassNameInAssetFiles(className: string, assets: FileDesc[]) {
	for(let prefab of assets) {
		if(findClassNameInPrefabData(className, prefab.asset as SerializedObject)) return true;
	}
}

function findClassNameInPrefabData(name: string, data: SerializedObject): boolean {
	if(!filterChildrenByName(data)) {
		return false;
	}
	if(data.c === name) {
		return true;
	}
	if(data.hasOwnProperty(':')) {
		return data[':']!.some((d) => {
			return findClassNameInPrefabData(name, d);
		});
	}
	return false;
}

function saveAssetsDescriptor(assets: Set<FileDesc>, fileName: string, projectDesc?: ProjectDesc, text?: KeyedObject) {

	let images: string[] = [];

	let sounds: SoundAssetEntry[] = [];

	const scenes: KeyedMap<SerializedObject> = {};
	const prefabs: KeyedMap<SerializedObject> = {};

	let resources: string[] | undefined;

	assets.forEach((file) => {
		if(isFileNameValidForBuild(file.assetName)) {
			if(file.assetType === AssetType.IMAGE) {
				if(!Lib.__isSystemTexture((file as FileDescImage).asset)) {
					if(!file.parentAsset) {
						assetsToCopy.push({
							from: file.fileName,
							to: getHashedAssetName(file)
						});
						images.push(getHashedAssetName(file));
					}
				}
			} else if(file.assetType === AssetType.SCENE) {
				scenes[file.assetName] = file.asset as SerializedObject;
			} else if(file.assetType === AssetType.PREFAB) {
				prefabs[file.assetName] = file.asset as SerializedObject;
			} else if(file.assetType === AssetType.SOUND) {
				for(let ext of game.projectDesc.soundFormats) {
					assetsToCopy.push({
						from: file.fileName.replace(/\wav$/, ext),
						to: getHashedAssetName(file) + '.' + ext
					});
				}

				sounds.push([getHashedAssetName(file), (file as FileDescSound).asset.preciseDuration]);
			} else if(file.assetType === AssetType.RESOURCE) {
				if(isAtlasAsset(file.asset)) {
					if(!resources) {
						resources = [];
					}
					resources.push(getHashedAssetName(file));
					assetsToCopy.push({
						from: file.fileName,
						to: getHashedAssetName(file) + '.json'
					});
				}
			}
		}
	});
	let assetsObj: AssetsDescriptor = {
		scenes,
		prefabs,
		resources,
		images,
		sounds,
		projectDesc,
		text
	};

	fs.writeFile(
		game.editor.currentProjectDir + '.tmp/' + fileName,
		JSON.stringify(assetsObj, fieldsFilter)
	);
}

function renderTextWithFilesLinks(txt: string) {
	if(txt.indexOf(' in file ') > 0) {
		const a = txt.split(' in file ');
		return R.span(null, a[0], ' in file ', R.a({
			href: '#',
			onClick: () => {
				game.editor.editFile(a[1]);
			}
		}, a[1]));
	}
	return txt;
}