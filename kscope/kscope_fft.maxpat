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
   640.0,
   480.0
  ],
  "openinpresentation": 0,
  "default_fontsize": 12.0,
  "default_fontface": 0,
  "default_fontname": "Arial",
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
  "devicewidth": 300.0,
  "description": "",
  "digest": "",
  "tags": "",
  "style": "",
  "subpatcher_template": "",
  "assistshowspatchername": 0,
  "boxes": [
   {
    "box": {
     "id": "f-in",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      30.0,
      30.0,
      60.0,
      22.0
     ],
     "text": "fftin~ 1",
     "outlettype": [
      "signal",
      "signal",
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "f-c2p",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 2,
     "patching_rect": [
      30.0,
      90.0,
      80.0,
      22.0
     ],
     "text": "cartopol~",
     "outlettype": [
      "signal",
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "f-poke",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 0,
     "patching_rect": [
      30.0,
      150.0,
      160.0,
      22.0
     ],
     "text": "jit.poke~ kscope_spec 1 1"
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "f-in",
      0
     ],
     "destination": [
      "f-c2p",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "f-in",
      1
     ],
     "destination": [
      "f-c2p",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "f-c2p",
      0
     ],
     "destination": [
      "f-poke",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "f-in",
      2
     ],
     "destination": [
      "f-poke",
      1
     ]
    }
   }
  ],
  "dependency_cache": [],
  "autosave": 0
 }
}