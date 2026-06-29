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
   760.0,
   540.0
  ],
  "openinpresentation": 1,
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
  "devicewidth": 540.0,
  "description": "K-Scope M0 spectrum (jsui)",
  "digest": "",
  "tags": "",
  "style": "",
  "subpatcher_template": "",
  "assistshowspatchername": 0,
  "boxes": [
   {
    "box": {
     "id": "o-title",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      20.0,
      200.0,
      22.0
     ],
     "text": "K-SCOPE",
     "presentation": 1,
     "presentation_rect": [
      16.0,
      10.0,
      160.0,
      22.0
     ],
     "fontsize": 15.0,
     "fontface": 1,
     "textcolor": [
      0.91,
      0.3,
      0.18,
      1.0
     ]
    }
   },
   {
    "box": {
     "id": "o-ui",
     "maxclass": "jsui",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      250.0,
      360.0,
      180.0
     ],
     "outlettype": [
      ""
     ],
     "filename": "kscope_ui.js",
     "presentation": 1,
     "presentation_rect": [
      12.0,
      40.0,
      516.0,
      196.0
     ]
    }
   },
   {
    "box": {
     "id": "o-tgl",
     "maxclass": "toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      400.0,
      20.0,
      24.0,
      24.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      510.0,
      12.0,
      18.0,
      18.0
     ]
    }
   },
   {
    "box": {
     "id": "o-in",
     "maxclass": "newobj",
     "numinlets": 0,
     "numoutlets": 2,
     "patching_rect": [
      20.0,
      70.0,
      80.0,
      22.0
     ],
     "text": "plugin~",
     "outlettype": [
      "signal",
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "o-out",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      470.0,
      80.0,
      22.0
     ],
     "text": "plugout~"
    }
   },
   {
    "box": {
     "id": "o-osc",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      440.0,
      70.0,
      80.0,
      22.0
     ],
     "text": "saw~ 110",
     "outlettype": [
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "o-amp",
     "maxclass": "newobj",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      440.0,
      100.0,
      60.0,
      22.0
     ],
     "text": "*~ 0.3",
     "outlettype": [
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "o-pfft",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      440.0,
      130.0,
      170.0,
      22.0
     ],
     "text": "pfft~ kscope_fft 2048 4",
     "outlettype": [
      "signal"
     ]
    }
   },
   {
    "box": {
     "id": "o-mtx",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 2,
     "patching_rect": [
      200.0,
      130.0,
      250.0,
      22.0
     ],
     "text": "jit.matrix kscope_spec 1 float32 1024",
     "outlettype": [
      "jit_matrix",
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-lb",
     "maxclass": "newobj",
     "numinlets": 0,
     "numoutlets": 1,
     "patching_rect": [
      120.0,
      90.0,
      70.0,
      22.0
     ],
     "text": "loadbang",
     "outlettype": [
      "bang"
     ]
    }
   },
   {
    "box": {
     "id": "o-qm",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      120.0,
      130.0,
      80.0,
      22.0
     ],
     "text": "qmetro 33",
     "outlettype": [
      "bang"
     ]
    }
   },
   {
    "box": {
     "id": "o-dbgm",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      240.0,
      90.0,
      80.0,
      22.0
     ],
     "text": "metro 1000",
     "outlettype": [
      "bang"
     ]
    }
   },
   {
    "box": {
     "id": "o-dbgmsg",
     "maxclass": "message",
     "numinlets": 2,
     "numoutlets": 1,
     "patching_rect": [
      240.0,
      120.0,
      40.0,
      22.0
     ],
     "text": "dbg",
     "outlettype": [
      ""
     ]
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "o-in",
      0
     ],
     "destination": [
      "o-out",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-in",
      1
     ],
     "destination": [
      "o-out",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-osc",
      0
     ],
     "destination": [
      "o-amp",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-amp",
      0
     ],
     "destination": [
      "o-pfft",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-lb",
      0
     ],
     "destination": [
      "o-tgl",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-tgl",
      0
     ],
     "destination": [
      "o-qm",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-tgl",
      0
     ],
     "destination": [
      "o-dbgm",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-qm",
      0
     ],
     "destination": [
      "o-mtx",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-mtx",
      0
     ],
     "destination": [
      "o-ui",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-dbgm",
      0
     ],
     "destination": [
      "o-dbgmsg",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-dbgmsg",
      0
     ],
     "destination": [
      "o-ui",
      0
     ]
    }
   }
  ],
  "dependency_cache": [],
  "autosave": 0
 }
}