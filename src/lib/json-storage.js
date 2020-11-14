import fs from 'fs'
import path from 'path'

export class JsonStorage {
	
	constructor(filePath) {
		this.filePath = filePath
		this.fileDir = path.dirname(this.filePath)
	}
	
	readFileData() {
		if (!fs.existsSync(this.fileDir)) {
			fs.mkdirSync(this.fileDir);
			fs.writeFileSync(this.filePath, '{}');
		} else if (!fs.existsSync(this.filePath)) {
			fs.writeFileSync(this.filePath, '{}');
		}
		
		return fs.readFileSync(this.filePath).toString();
	}
	
	writeToFile(data) {
		fs.writeFileSync(this.filePath, data);
	}
	
	get(key, defaultValue = null) {
		const content = this.readFileData();
		const json = JSON.parse(content);
		if (key in json) {
			return json[key];
		} else {
			return defaultValue
		}
	}
	
	set(key, value) {
		const content = this.readFileData();
		const json = JSON.parse(content);
		json[key] = value;
		this.writeToFile(JSON.stringify(json));
	}
	
	delete(key) {
		const content = this.readFileData();
		const json = JSON.parse(content);
		delete json[key];
		this.writeToFile(JSON.stringify(json));
	}
	
	getAll() {
		const content = this.readFileData();
		return JSON.parse(content);
	}
	
	getAllKeys() {
		return Object.keys(this.getAll());
	}
	
}