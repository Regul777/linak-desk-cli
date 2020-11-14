import path from 'path'
import readline from 'readline'
import { program } from 'commander'
import { JsonStorage } from './lib/json-storage'
import { Bluetooth } from 'webbluetooth'

const SERVICE_ID = '99fa0001-338a-1024-8a49-009c0215f78a'
const CHAR_ID = '99fa0002-338a-1024-8a49-009c0215f78a'

const POSITION_SERVICE_ID = '99fa0020-338a-1024-8a49-009c0215f78a'
const POSITION_CHAR_ID = '99fa0021-338a-1024-8a49-009c0215f78a'

const PACKAGE_JSON = require('../package.json')
const BIN_NAME = Object.keys(PACKAGE_JSON.bin)[0]
const config = new JsonStorage(path.resolve(process.mainModule.path, 'linak_desk.json'))

const bufferToNum = (buff) => new Uint16Array(buff)[0]
const positionToMm = (value) => {
	const lowestPosMm = parseInt(config.get('lowest_pos_mm'))
	return Math.round((381 / 3815) * value + lowestPosMm)
}
const bufferPositionToMm = (value) => positionToMm(bufferToNum(value))


program.version(PACKAGE_JSON.version)

program.command('scan [scan_time_seconds]')
	.description(`Scan and select a preferred bluetooth device to control. The device must be ALREADY PAIRED. Default scan time is 10 seconds: \n${BIN_NAME} scan 15\n`)
	.action(asyncCmdAndExit(cmdScan));

program.command('lowest_pos_mm <value>')
	.description(`Setup your desk lowest position in mm (my lowest position is 617): \n${BIN_NAME} lowest_pos_mm 617`)
	.action(asyncCmdAndExit(cmdSetLowestPosition));

program.command('device_id <value>')
	.description(`Setup a desk Bluetooth Device id manually: \n${BIN_NAME} device_id E1-AA-BB-CC-DD-EE`)
	.action(asyncCmdAndExit(cmdSetDeviceId));

program.command('config')
	.description(`Display current config`)
	.action(asyncCmdAndExit(cmdShowConfig));

program.command('p')
	.alias('position')
	.description('Connect to the desk and get current position')
	.action(asyncCmdAndExit(inspectDeviceConfig, cmdPosition));

program.command('ps')
	.alias('positions')
	.description('List all saved positions aliases')
	.action(asyncCmdAndExit(cmdPositions));

program.command('save <name> [height_mm]')
	.description('Save position height as <name> alias. Without [height_mm] will be saved current desk height position.')
	.action(asyncCmdAndExit(cmdSavePosition));

program.command('del <name>')
	.description('Delete position height with alias <name>.')
	.action(asyncCmdAndExit(cmdDeletePosition));

program.parse(process.argv)

function asyncCmdAndExit(...functions) {
	return async function() {
		for (const fn of functions) {
			await fn.apply(this, arguments)
		}
		process.exit(0)
	}
}

function inspectDeviceConfig() {
	let error = false
	if (!config.get('device_id')) {
		console.log(`[Config 1/2] No preferred device id. Use "scan" command before and select device to connect: \n${BIN_NAME} scan`)
		error = true
	}
	if (!config.get('lowest_pos_mm')) {
		console.log(`[Config 2/2] Setup your desk lowest position in mm (my lowest position is 617): \n${BIN_NAME} lowest_pos_mm 617`)
		error = true
	}
	if (error) process.exit(0);
}

function setConfig(key, value) {
	config.set(key, value)
	console.log(`Saved config.${key} = ${value}`)
}

function cmdSetLowestPosition(value) {
	setConfig('lowest_pos_mm', value)
}

function cmdSetDeviceId(value) {
	setConfig('device_id', value)
}

function cmdShowConfig() {
	console.log("Current Config:")
	console.log(JSON.stringify(config.getAll(), null, 2))
}


async function cmdPosition() {
	await getCurrentPositionMm((mm) => {
		console.log(`Current position is ${mm.toFixed(0)} mm`)
	})
}

async function cmdScan(scanTimeSec = 10) {
	const bluetoothDevices = []
	let isScanningCompleted = false
	
	const deviceFound = (bluetoothDevice) => {
		if (isScanningCompleted) return;
		const discovered = bluetoothDevices.some(device => {
			return (device.id === bluetoothDevice.id)
		})
		if (discovered) return
		
		bluetoothDevices.push({ id: bluetoothDevice.id })
		
		console.log(`${bluetoothDevices.length}: ${bluetoothDevice.id}`)
	}
	
	const bluetooth = new Bluetooth({ deviceFound })
	console.log(`Scanning devices for ${scanTimeSec} seconds...`);
	
	setTimeout(() => {
		isScanningCompleted = true
		
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		
		rl.question(`Scanning is finished. Select prefered device number [1 - ${bluetoothDevices.length}]: `, (answer) => {
			const index = parseInt(answer)
			if (index && index <= bluetoothDevices.length) {
				const device = bluetoothDevices[index - 1]
				if (device && device.id) {
					config.set('device_id', device.id)
					console.log(`Saved preferred device [${index}] id: ${device.id}`);
				} else {
					console.log(`Can't find id for [${index}]. id="${device.id}"`);
				}
			} else {
				console.log(`Can't find device with index [${index}]`);
			}
			rl.close();
			process.exit(0)
		});
		
	}, scanTimeSec * 1000)
	
	await bluetooth.requestDevice({ acceptAllDevices: true })
}

async function getCurrentPositionMm(cb) {
	await connectToDevice(async (desk, server) => {
		const positionService = await server.getPrimaryService(POSITION_SERVICE_ID);
		const char = await positionService.getCharacteristic(POSITION_CHAR_ID);
		const value = await char.readValue()
		
		const mm = bufferPositionToMm(value.buffer)
		await cb(mm, desk)
	})
}

async function connectToDevice(cb) {
	const deviceId = config.get('device_id')
	
	const deviceFound = (bluetoothDevice, selectFn) => {
		if (bluetoothDevice.id === deviceId) {
			selectFn()
		}
	}
	
	const bluetooth = new Bluetooth({ deviceFound })
	console.log(`Connecting to ${deviceId}...`)
	
	const device = await bluetooth.requestDevice({ acceptAllDevices: true })
	device.addEventListener('gattserverdisconnected', onDisconnected)
	
	const server = await device.gatt.connect()
	const primaryService = await server.getPrimaryService(SERVICE_ID)
	
	await cb(device, server, primaryService);
	
	device.removeEventListener('gattserverdisconnected', onDisconnected)
	await device.gatt.disconnect()
	
}

function onDisconnected() {
	console.log('Error: Device is disconnected. Exit...')
	process.exit(0)
}

function cmdPositions() {
	const positions = config.get('positions', {});
	let keys = Object.keys(positions)
	if (keys.length === 0) {
		console.log(`No saved positions`)
	} else {
		console.log(`Saved positions [${keys.length}]:`)
		keys.forEach(key => {
			console.log(`${key}: ${positions[key]} mm`)
		})
	}
}

function savePositionToConfig(name, value) {
	const positions = config.get('positions', {});
	if (value <= 0) {
		delete positions[name];
		config.set('positions', positions)
		console.log(`Position "${name}" deleted.`)
	} else {
		positions[name] = value
		config.set('positions', positions)
		console.log(`Saved new position "${name}": ${value} mm`)
	}
}

async function cmdSavePosition(positionName, positionValue) {
	positionValue = parseInt(positionValue)
	
	if (!positionName) {
		return console.error('Position name can not be empty')
	}
	
	if (!positionValue) {
		await getCurrentPositionMm((mm) => {
			savePositionToConfig(positionName, mm)
		})
	} else {
		savePositionToConfig(positionName, parseInt(positionValue))
	}
}

function cmdDeletePosition(positionName) {
	if (!positionName) {
		console.error('Position name can not be empty')
	} else {
		savePositionToConfig(positionName, 0)
	}
}
