{
	"patcher": {
		"fileversion": 1,
		"appversion": {
			"major": 8,
			"minor": 6,
			"revision": 0,
			"architecture": "x64",
			"modernui": 1
		},
		"classnamespace": "box",
		"rect": [
			100.0,
			100.0,
			820.0,
			580.0
		],
		"openinpresentation": 1,
		"default_fontsize": 12.0,
		"default_fontface": 0,
		"default_fontname": "Lucida Sans Unicode",
		"gridonopen": 1,
		"gridsize": [
			15.0,
			15.0
		],
		"gridsnaponopen": 1,
		"objectsnaponopen": 1,
		"statusbarvisible": 2,
		"toolbarvisible": 1,
		"lefttoolbarpinned": 0,
		"toptoolbarpinned": 0,
		"righttoolbarpinned": 0,
		"bottomtoolbarpinned": 0,
		"toolbars_unpinned_last_save": 0,
		"tallnewobj": 0,
		"boxanimatetime": 200,
		"enablehscroll": 1,
		"enablevscroll": 1,
		"devicewidth": 0.0,
		"description": "K-Ripper — rip audio from any URL into the host audio track.",
		"digest": "K-Ripper",
		"tags": "",
		"style": "",
		"subpatcher_template": "",
		"assistshowspatchername": 0,
		"boxes": [
			{
				"box": {
					"id": "obj-title",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"fontname": "Arial Bold",
					"fontsize": 19.0,
					"textcolor": [
						0.91,
						0.91,
						0.93,
						1.0
					],
					"bgcolor": [
						0.0,
						0.0,
						0.0,
						0.0
					],
					"patching_rect": [
						40.0,
						24.0,
						240.0,
						28.0
					],
					"presentation": 1,
					"presentation_rect": [
						16.0,
						14.0,
						240.0,
						28.0
					],
					"text": "K-RIPPER"
				}
			},
			{
				"box": {
					"id": "obj-status-dot",
					"varname": "kr_dot",
					"maxclass": "panel",
					"bgcolor": [
						0.373,
						0.796,
						0.306,
						1.0
					],
					"border": 0,
					"rounded": 50,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						40.0,
						60.0,
						8.0,
						8.0
					],
					"presentation": 1,
					"presentation_rect": [
						358.0,
						24.0,
						8.0,
						8.0
					]
				}
			},
			{
				"box": {
					"id": "obj-status",
					"varname": "kr_status",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"fontname": "Lucida Sans Unicode",
					"fontsize": 10.0,
					"textcolor": [
						0.55,
						0.55,
						0.59,
						1.0
					],
					"bgcolor": [
						0.0,
						0.0,
						0.0,
						0.0
					],
					"textjustification": 2,
					"patching_rect": [
						54.0,
						58.0,
						380.0,
						14.0
					],
					"presentation": 1,
					"presentation_rect": [
						210.0,
						17.0,
						194.0,
						14.0
					],
					"text": "ready",
					"annotation_name": "Status",
					"annotation": "Current rip status."
				}
			},
			{
				"box": {
					"id": "obj-url",
					"maxclass": "textedit",
					"numinlets": 1,
					"numoutlets": 4,
					"outlettype": [
						"",
						"int",
						"",
						""
					],
					"bgcolor": [
						0.102,
						0.102,
						0.133,
						1.0
					],
					"textcolor": [
						0.94,
						0.94,
						0.95,
						1.0
					],
					"bordercolor": [
						0.18,
						0.18,
						0.22,
						1.0
					],
					"fontname": "Lucida Sans Unicode",
					"fontsize": 12.0,
					"patching_rect": [
						40.0,
						120.0,
						280.0,
						32.0
					],
					"presentation": 1,
					"presentation_rect": [
						16.0,
						108.0,
						264.0,
						32.0
					],
					"rightclick": "noaction",
					"text": "",
					"annotation_name": "URL",
					"annotation": "Paste a track URL here, or leave empty to rip the link on your clipboard."
				}
			},
			{
				"box": {
					"id": "obj-rip",
					"maxclass": "live.text",
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": [
						"",
						"",
						"float"
					],
					"parameter_enable": 0,
					"bgcolor": [
						0.91,
						0.227,
						0.122,
						1.0
					],
					"activebgcolor": [
						0.757,
						0.192,
						0.102,
						1.0
					],
					"textcolor": [
						1.0,
						1.0,
						1.0,
						1.0
					],
					"bordercolor": [
						0.0,
						0.0,
						0.0,
						0.0
					],
					"fontname": "Lucida Sans Unicode",
					"fontface": 1,
					"fontsize": 12.0,
					"patching_rect": [
						330.0,
						120.0,
						114.0,
						32.0
					],
					"presentation": 1,
					"presentation_rect": [
						290.0,
						108.0,
						114.0,
						32.0
					],
					"text": "RIP",
					"varname": "kr_rip",
					"annotation_name": "RIP",
					"annotation": "Downloads the track and drops it into the first empty clip slot on this track. Click again while ripping to cancel."
				}
			},
			{
				"box": {
					"id": "obj-plugin",
					"maxclass": "newobj",
					"numinlets": 0,
					"numoutlets": 2,
					"outlettype": [
						"signal",
						"signal"
					],
					"patching_rect": [
						500.0,
						30.0,
						80.0,
						22.0
					],
					"text": "plugin~"
				}
			},
			{
				"box": {
					"id": "obj-plugout",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 0,
					"patching_rect": [
						500.0,
						80.0,
						80.0,
						22.0
					],
					"text": "plugout~"
				}
			},
			{
				"box": {
					"id": "obj-tosym",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					],
					"patching_rect": [
						500.0,
						130.0,
						70.0,
						22.0
					],
					"text": "tosymbol"
				}
			},
			{
				"box": {
					"id": "obj-prep-url",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					],
					"patching_rect": [
						500.0,
						160.0,
						90.0,
						22.0
					],
					"text": "prepend url"
				}
			},
			{
				"box": {
					"id": "obj-sel",
					"maxclass": "newobj",
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": [
						"bang",
						""
					],
					"patching_rect": [
						330.0,
						160.0,
						50.0,
						22.0
					],
					"text": "sel 1"
				}
			},
			{
				"box": {
					"id": "obj-trig",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"bang",
						"bang"
					],
					"patching_rect": [
						330.0,
						190.0,
						50.0,
						22.0
					],
					"text": "t b b"
				}
			},
			{
				"box": {
					"id": "obj-js",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					],
					"patching_rect": [
						500.0,
						220.0,
						200.0,
						22.0
					],
					"text": "js kripper.js"
				}
			},
			{
				"box": {
					"id": "obj-node",
					"maxclass": "newobj",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					],
					"patching_rect": [
						500.0,
						270.0,
						460.0,
						22.0
					],
					"text": "node.script kripper.mjs @autostart 1 @defer 1 @watch 1"
				}
			},
			{
				"box": {
					"id": "obj-icon-sc",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_sc.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						40.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						22.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_sc"
				}
			},
			{
				"box": {
					"id": "obj-icon-yt",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_yt.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						68.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						46.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_yt"
				}
			},
			{
				"box": {
					"id": "obj-icon-bc",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_bc.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						96.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						70.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_bc"
				}
			},
			{
				"box": {
					"id": "obj-icon-mc",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_mc.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						124.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						94.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_mc"
				}
			},
			{
				"box": {
					"id": "obj-icon-tt",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_tt.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						152.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						118.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_tt"
				}
			},
			{
				"box": {
					"id": "obj-icon-tw",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_tw.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						208.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						142.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_tw"
				}
			},
			{
				"box": {
					"id": "obj-icon-vm",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_vm.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						236.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						166.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_vm"
				}
			},
			{
				"box": {
					"id": "obj-icon-rd",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"pic": "assets/icon_rd.png",
					"embed": 0,
					"autofit": 1,
					"patching_rect": [
						264.0,
						200.0,
						20.0,
						20.0
					],
					"presentation": 1,
					"presentation_rect": [
						190.0,
						84.0,
						16.0,
						16.0
					],
					"varname": "kr_ic_rd"
				}
			},
			{
				"box": {
					"id": "obj-track",
					"varname": "kr_track",
					"maxclass": "comment",
					"numinlets": 1,
					"numoutlets": 0,
					"fontname": "Lucida Sans Unicode",
					"fontsize": 10.0,
					"textcolor": [
						0.62,
						0.62,
						0.66,
						1.0
					],
					"bgcolor": [
						0.0,
						0.0,
						0.0,
						0.0
					],
					"patching_rect": [
						40.0,
						226.0,
						380.0,
						16.0
					],
					"presentation": 1,
					"presentation_rect": [
						16.0,
						58.0,
						324.0,
						15.0
					],
					"annotation_name": "Track",
					"annotation": "The track currently being ripped.",
					"text": " "
				}
			},
			{
				"box": {
					"id": "obj-art",
					"varname": "kr_art",
					"maxclass": "fpic",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"jit_matrix"
					],
					"embed": 0,
					"autofit": 1,
					"hidden": 1,
					"patching_rect": [
						40.0,
						280.0,
						56.0,
						56.0
					],
					"presentation": 1,
					"presentation_rect": [
						348.0,
						44.0,
						56.0,
						56.0
					],
					"annotation_name": "Cover art",
					"annotation": "Artwork of the last ripped track."
				}
			},
			{
				"box": {
					"id": "obj-bg",
					"maxclass": "panel",
					"bgcolor": [
						0.055,
						0.055,
						0.078,
						1.0
					],
					"bordercolor": [
						0.137,
						0.137,
						0.157,
						1.0
					],
					"border": 1,
					"rounded": 6,
					"numinlets": 1,
					"numoutlets": 0,
					"patching_rect": [
						20.0,
						20.0,
						420.0,
						160.0
					],
					"presentation": 1,
					"presentation_rect": [
						0.0,
						0.0,
						420.0,
						160.0
					],
					"annotation_name": "K-Ripper",
					"annotation": "Rips audio from SoundCloud, YouTube, Bandcamp and more, straight into this track."
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"obj-url",
						0
					],
					"destination": [
						"obj-tosym",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-tosym",
						0
					],
					"destination": [
						"obj-prep-url",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-prep-url",
						0
					],
					"destination": [
						"obj-js",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-rip",
						0
					],
					"destination": [
						"obj-sel",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-sel",
						0
					],
					"destination": [
						"obj-trig",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-trig",
						1
					],
					"destination": [
						"obj-url",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-trig",
						0
					],
					"destination": [
						"obj-js",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-js",
						0
					],
					"destination": [
						"obj-node",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-node",
						0
					],
					"destination": [
						"obj-js",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-plugin",
						0
					],
					"destination": [
						"obj-plugout",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-plugin",
						1
					],
					"destination": [
						"obj-plugout",
						1
					]
				}
			}
		],
		"dependency_cache": [],
		"autosave": 0
	}
}