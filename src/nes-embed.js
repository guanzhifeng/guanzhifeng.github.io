import { NES, Controller } from 'jsnes';
import nipplejs from 'nipplejs';
import localforage from 'localforage';

const nesStore = localforage.createInstance({
	name: 'myNES',
})

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;
const FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT;

let canvas_ctx, image;
let framebuffer_u8, framebuffer_u32;

const AUDIO_BUFFERING = 512;
const SAMPLE_COUNT = 4 * 1024;
const SAMPLE_MASK = SAMPLE_COUNT - 1;
const audio_samples_L = new Float32Array(SAMPLE_COUNT);
const audio_samples_R = new Float32Array(SAMPLE_COUNT);
let audio_write_cursor = 0, audio_read_cursor = 0;
let romBuffer, title;

var nes = new NES({
	onFrame: function (framebuffer_24) {
		for (var i = 0; i < FRAMEBUFFER_SIZE; i++) framebuffer_u32[i] = 0xFF000000 | framebuffer_24[i];
	},
	onAudioSample: function (l, r) {
		audio_samples_L[audio_write_cursor] = l;
		audio_samples_R[audio_write_cursor] = r;
		audio_write_cursor = (audio_write_cursor + 1) & SAMPLE_MASK;
	},
});

let lastTouchEnd = 0
document.documentElement.addEventListener('touchend', event => {
	var now = Date.now()
	if (now - lastTouchEnd <= 300) {
		event.preventDefault()
	}
	lastTouchEnd = now
},
	{
		passive: false
	}
)

function onAnimationFrame() {
	window.requestAnimationFrame(onAnimationFrame);

	image.data.set(framebuffer_u8);
	canvas_ctx.putImageData(image, 0, 0);
}

function audio_remain() {
	return (audio_write_cursor - audio_read_cursor) & SAMPLE_MASK;
}

function audio_callback(event) {
	var dst = event.outputBuffer;
	var len = dst.length;

	// Attempt to avoid buffer underruns.
	if (audio_remain() < AUDIO_BUFFERING) nes.frame();

	var dst_l = dst.getChannelData(0);
	var dst_r = dst.getChannelData(1);
	for (var i = 0; i < len; i++) {
		var src_idx = (audio_read_cursor + i) & SAMPLE_MASK;
		dst_l[i] = audio_samples_L[src_idx];
		dst_r[i] = audio_samples_R[src_idx];
	}

	audio_read_cursor = (audio_read_cursor + len) & SAMPLE_MASK;
}
const manager = nipplejs.create({
	zone: document.getElementById('joy'), 
	mode: 'static', 
	position: {
		left: '50%', 
		top: '50%', 
	}, 
	size: 130,
	color: 'blue',
})
let move;
const controlStatus = {
	left: {
		s: 0,
		btn: 'BUTTON_LEFT' 
	}, 
	right: {
		s: 0,
		btn: 'BUTTON_RIGHT' 
	}, 
	up: {
		s: 0,
		btn: 'BUTTON_UP' 
	}, 
	down: {
		s: 0,
		btn: 'BUTTON_DOWN' 
	},  
}

manager.on('move', (e, data)=>{
	if(move !== data.direction?.angle){
		if(move && controlStatus[move].s){
			nes.buttonUp(1, Controller[controlStatus[move].btn]);
			controlStatus[move].s = 0;
		}
		switch (data.direction?.angle) {
			case 'up':
				nes.buttonDown(1, Controller.BUTTON_UP);
				move = data.direction.angle;
				controlStatus[move].s = 1;
				break;
			case 'down':
				nes.buttonDown(1, Controller.BUTTON_DOWN);
				move = data.direction.angle;
				controlStatus[move].s = 1;
				break;
			case 'left':
				nes.buttonDown(1, Controller.BUTTON_LEFT);
				move = data.direction.angle;
				controlStatus[move].s = 1;
				break;
			case 'right':
				nes.buttonDown(1, Controller.BUTTON_RIGHT);
				move = data.direction.angle;
				controlStatus[move].s = 1;
				break;
			default:
				for(let i in controlStatus){
					if(controlStatus[i].s){
						nes.buttonUp(1, Controller[controlStatus[i].btn]);
						controlStatus[i].s = 0;
					}
				}
				move = '';
		}
	}
}).on('end', ()=>{
	for(let i in controlStatus){
		if(controlStatus[i].s){
			nes.buttonUp(1, Controller[controlStatus[i].btn]);
			controlStatus[i].s = 0;
		}
	}
	move = '';
})
function bindBTN(id, btn) {
	document.getElementById(id)?.addEventListener('touchstart', e => { nes.buttonDown(1, Controller[btn]); e.preventDefault(); e.target.style.boxShadow = '1px 1px 3px #111 inset';}, false);
	document.getElementById(id)?.addEventListener('touchend', e => { nes.buttonUp(1, Controller[btn]); e.preventDefault(); e.target.style.boxShadow = '-1px -1px 3px #111 inset';}, false);
}
bindBTN('a', 'BUTTON_A');
bindBTN('b', 'BUTTON_B');
bindBTN('select', 'BUTTON_SELECT');
bindBTN('start', 'BUTTON_START');

function nes_init(canvas_id) {
	var canvas = document.getElementById(canvas_id);
	canvas_ctx = canvas.getContext("2d");
	image = canvas_ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

	// Allocate framebuffer array.
	var buffer = new ArrayBuffer(image.data.length);
	framebuffer_u8 = new Uint8ClampedArray(buffer);
	framebuffer_u32 = new Uint32Array(buffer);

	// Setup audio.
	var audio_ctx = new window.AudioContext();
	var script_processor = audio_ctx.createScriptProcessor(AUDIO_BUFFERING, 0, 2);
	script_processor.onaudioprocess = audio_callback;
	script_processor.connect(audio_ctx.destination);
}

function nes_boot(rom_data) {
	nes.loadROM(rom_data);
	window.requestAnimationFrame(onAnimationFrame);
}

function nes_load_data(rom_data) {
	nes_init('nes');
	nes_boot(rom_data);
}





document.getElementById('fileLoad').addEventListener('change', e => {
	let reader = new FileReader();
	reader.readAsBinaryString(e.target.files[0]);
	title = e.target.files[0].name;
	reader.onload = d => {
		try {
			romBuffer = d.target.result;
			nes_load_data(romBuffer);
			console.log(title, '开始运行');
		} catch (f) {
			console.log('该游戏不被支持');
		}

	}
})



const saveBtn = document.getElementById('save');
const loadBtn = document.getElementById('load');

function getNesData() {
	const ppuData = nes.ppu.toJSON()
	const cpuData = nes.cpu.toJSON()
	delete ppuData.attrib
	delete ppuData.bgbuffer
	delete ppuData.buffer
	delete ppuData.pixrendered
	delete ppuData.vramMirrorTable
	const vramMenZip = compressArray(ppuData.vramMem);
	const nameTableZip = compressNameTable(ppuData.nameTable)
	const ptTileZip = compressPtTile(ppuData.ptTile)
	const cpuMemZip = compressArray(cpuData.mem)
	delete ppuData.vramMem
	delete ppuData.nameTable
	delete cpuData.mem
	delete ppuData.ptTile
	return {
		cpu: cpuData,
		mmap: nes.mmap.toJSON(),
		ppu: ppuData,
		vramMenZip,
		nameTableZip,
		cpuMemZip,
		ptTileZip,
	}
}

saveBtn.addEventListener('click', () => {
	if (nes.cpu.irqRequested) {
		nesStore.setItem(title, getNesData());
		saveBtn.innerText = '已保存';
		setTimeout(()=>{
			saveBtn.innerText = '保存';
		},1000);
	} else {
		console.log('游戏尚未运行，请开始游戏后再试。')
	}
})

// 读取游戏
function load(saveData) {
	try {
		nes.ppu.reset()
		const ppuData = saveData.ppu
		const cpuData = saveData.cpu
		ppuData.attrib = new Array(0x20).fill(0);
		ppuData.bgbuffer = new Array(0xF000).fill(0);
		ppuData.buffer = new Array(0xF000).fill(0);
		ppuData.pixrendered = new Array(0xF000).fill(0);
		ppuData.vramMem = decompressArray(saveData.vramMenZip)
		ppuData.nameTable = decompressNameTable(saveData.nameTableZip)
		ppuData.vramMirrorTable = new Array(0x8000).fill(0).map((_, i) => i);
		ppuData.ptTile = decompressPtTile(saveData.ptTileZip)
		cpuData.mem = decompressArray(saveData.cpuMemZip)
		nes.ppu.reset()
		nes.romData = romBuffer
		nes.cpu.fromJSON(cpuData)
		nes.mmap.fromJSON(saveData.mmap)
		nes.ppu.fromJSON(ppuData)
	}
	catch (e) {
		console.log(e)
		console.log('读取失败，数据丢失或无效。')
	}
}

loadBtn.addEventListener('click', () => {
	if (nes.cpu.irqRequested) {
		nesStore.getItem(title).then( saveData =>{
			if(saveData){
				load(saveData);
				loadBtn.innerText = '读取成功';
				setTimeout(()=>{
					loadBtn.innerText = '读取';
				},1000)
			}else{
				alert('读取存档出错');
			}
		}).catch(()=>{
			alert('读取存档出错');
		})
	} else {
		console.log('游戏尚未运行，请开始游戏后再试。')
	}
})

function compressArray(arr) {
	const compressed = []
	let current = arr[0]
	let count = 1
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] == current) {
			count++
		}
		else {
			if (count > 1) {
				compressed.push(count)
				compressed.push(current)
			}
			else {
				compressed.push(-current - 1)
			}
			current = arr[i]
			count = 1
		}
	}
	compressed.push(count)
	compressed.push(current)
	return compressed
}

function decompressArray(compressed) {
	const decompressed = []
	for (let i = 0; i < compressed.length;) {
		if (compressed[i] < 0) {
			decompressed.push(-compressed[i] - 1)
			i++
		}
		else {
			const count = compressed[i]
			const value = compressed[i + 1]
			for (let j = 0; j < count; j++) {
				decompressed.push(value)
			}
			i += 2
		}
	}
	return decompressed
}

function compressPtTile(ptTile) {
	const opaques = []
	const pixs = []
	for (let i = 0; i < ptTile.length; i++) {
		for (let j = 0; j < ptTile[i].opaque.length; j++) {
			if (ptTile[i].opaque[j] === false) {
				opaques.push(0)
			}
			else {
				opaques.push(1)
			}
		}
		pixs.push(...ptTile[i].pix)
	}
	return [compressArray(opaques), compressArray(pixs)]
}

function decompressPtTile(compressed) {
	const ptTile = []
	let opaque = Array(8)
	let pix = []
	const opaques = decompressArray(compressed[0])
	const pixs = decompressArray(compressed[1])
	for (let i = 0; i < 512; i += 1) {
		for (let j = 0; j < 8; j += 1) {
			if (opaques[i * 8 + j] === 0) {
				opaque[j] = false
			}
		}
		for (let j = 0; j < 64; j += 1) {
			pix[j] = pixs[i * 64 + j]
		}
		ptTile.push({
			opaque,
			pix,
		})
		opaque = Array(8)
		pix = []
	}
	return ptTile
}

function compressNameTable(nameTable) {
	const tile = []
	const attrib = []
	nameTable.reduce((prev, curr) => {
		tile.push(...curr.tile)
		attrib.push(...curr.attrib)
		return prev
	}, tile)
	return [compressArray(tile), compressArray(attrib)]
}

function decompressNameTable(compressed) {
	const nameTable = []
	let tile = []
	let attrib = []
	const tiles = decompressArray(compressed[0])
	const attrs = decompressArray(compressed[1])
	for (let i = 0; i < 1024 * 4; i += 1) {
		tile.push(tiles[i])
		attrib.push(attrs[i])
		if ((i + 1) % 1024 === 0) {
			nameTable.push({ tile, attrib })
			tile = []
			attrib = []
		}
	}
	return nameTable
}