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
   720.0,
   520.0
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
  "devicewidth": 300.0,
  "description": "K-Scope M0 spine test (spectrum -> matrix)",
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
      20.0
     ],
     "text": "K-SCOPE M0",
     "presentation": 1,
     "presentation_rect": [
      10.0,
      8.0,
      160.0,
      20.0
     ],
     "fontsize": 13.0,
     "fontface": 1
    }
   },
   {
    "box": {
     "id": "o-hint",
     "maxclass": "comment",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      20.0,
      44.0,
      300.0,
      20.0
     ],
     "text": "spine test - console [kscope] max should be > 0",
     "presentation": 1,
     "presentation_rect": [
      10.0,
      30.0,
      300.0,
      20.0
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
      90.0,
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
      340.0,
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
      80.0,
      80.0,
      22.0
     ],
     "text": "cycle~ 440",
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
      110.0,
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
      150.0,
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
      150.0,
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
     "id": "o-tgl",
     "maxclass": "toggle",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      200.0,
      90.0,
      24.0,
      24.0
     ],
     "outlettype": [
      ""
     ],
     "presentation": 1,
     "presentation_rect": [
      180.0,
      6.0,
      24.0,
      24.0
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
      340.0,
      60.0,
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
      200.0,
      120.0,
      90.0,
      22.0
     ],
     "text": "qmetro 1000",
     "outlettype": [
      "bang"
     ]
    }
   },
   {
    "box": {
     "id": "o-3m",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 3,
     "patching_rect": [
      200.0,
      190.0,
      60.0,
      22.0
     ],
     "text": "jit.3m",
     "outlettype": [
      "",
      "",
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-pmin",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      150.0,
      230.0,
      70.0,
      22.0
     ],
     "text": "prepend min",
     "outlettype": [
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-pmean",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      230.0,
      230.0,
      80.0,
      22.0
     ],
     "text": "prepend mean",
     "outlettype": [
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-pmax",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      320.0,
      230.0,
      70.0,
      22.0
     ],
     "text": "prepend max",
     "outlettype": [
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-snap",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      200.0,
      100.0,
      22.0
     ],
     "text": "snapshot~ 1000",
     "outlettype": [
      "float"
     ]
    }
   },
   {
    "box": {
     "id": "o-prein",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 1,
     "patching_rect": [
      20.0,
      240.0,
      70.0,
      22.0
     ],
     "text": "prepend in",
     "outlettype": [
      ""
     ]
    }
   },
   {
    "box": {
     "id": "o-log",
     "maxclass": "newobj",
     "numinlets": 1,
     "numoutlets": 0,
     "patching_rect": [
      150.0,
      290.0,
      130.0,
      22.0
     ],
     "text": "js kscope_log.js"
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
      "o-3m",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-3m",
      0
     ],
     "destination": [
      "o-pmin",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-3m",
      1
     ],
     "destination": [
      "o-pmean",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-3m",
      2
     ],
     "destination": [
      "o-pmax",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-pmin",
      0
     ],
     "destination": [
      "o-log",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-pmean",
      0
     ],
     "destination": [
      "o-log",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-pmax",
      0
     ],
     "destination": [
      "o-log",
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
      "o-snap",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-snap",
      0
     ],
     "destination": [
      "o-prein",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "o-prein",
      0
     ],
     "destination": [
      "o-log",
      0
     ]
    }
   }
  ],
  "dependency_cache": [],
  "autosave": 0
 }
}