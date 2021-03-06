
import EventEmitter from 'events';
import {to_luastring, to_jsstring} from 'fengari/src/fengaricore';
import {lua_pop, lua_getglobal, lua_pcall, lua_atnativeerror, lua_pushstring, lua_touserdata, lua_rawgeti, LUA_REGISTRYINDEX, lua_resume, LUA_OK, LUA_YIELD} from 'fengari/src/lua';
import {luaL_newstate, luaL_loadstring, luaL_tolstring, luaL_unref, luaL_checknumber} from 'fengari/src/lauxlib';
import {luaL_openlibs} from 'fengari/src/lualib';
import MappedData from '../mappeddata';
import jass2lua from './jass2lua';
import bindNatives from './natives';
import JassPlayer from './types/player';
import constantHandles from './constanthandles';
import Thread from './thread';

/**
 * A Jass2 context.
 */
export default class Context extends EventEmitter {
  /**
   *
   */
  constructor() {
    super();

    /** @member {lua_State} */
    this.L = luaL_newstate();

    luaL_openlibs(this.L);

    bindNatives(this);

    lua_atnativeerror(this.L, (L) => {
      let e = lua_touserdata(L, -1);

      lua_pushstring(L, e.stack);

      return 1;
    });

    /** @member {?War3Map} */
    this.map = null;

    /** @member {number} */
    this.handle = 0;
    /** @member {Array<number>} */
    this.freeHandles = [];
    /** @member {Array<?JassHandle} */
    this.handles = [];

    this.name = '';
    this.description = '';
    this.players = [];
    this.actualPlayers = 0;
    this.startLocations = [];

    this.constantHandles = constantHandles(this);

    for (let i = 0; i < 28; i++) {
      this.players[i] = this.addHandle(new JassPlayer(i, 28));
    }

    // this.mappedData = new MappedData();

    // this.mapName = '';
    // this.mapDescription = '';
    // this.gamePlacement = null;
    // this.gameSpeed = null;
    // this.gameDifficulty = null;
    // this.playerCount = 0;
    // this.teamCount = 0;
    // this.startLocations = [];
    // this.players = [];
    // this.teams = [];

    // this.stringTable = map.readStringTable();

    /** @member {Set<JassTimer>} */
    this.timers = new Set();

    /** @member {Set<Trigger>} */
    this.triggers = new Set();

    /** @member {Set<Thread>} */
    this.threads = new Set();

    /** @member {?Thread} */
    this.currentThread = null;

    /** @member {?Handle} */
    this.enumUnit = null;
    /** @member {?Handle} */
    this.filterUnit = null;
    /** @member {?Handle} */
    this.enumPlayer = null;


    this.t = 0;
  }

  /**
   *
   */
  start() {
    this.t = performance.now();
  }

  /**
   *
   */
  step() {
    let t = performance.now();
    let dt = (t - this.t) * 0.001;
    let timers = this.timers;
    let threads = this.threads;

    for (let timer of timers) {
      timer.elapsed += dt;

      if (timer.elapsed >= timer.timeout) {
        let thread = new Thread(this.L, {expiredTimer: timer});
        let L = thread.L;

        // Push the entry point onto the thread's stack, so when the thread is resumed it will immediately be called.
        lua_rawgeti(L, LUA_REGISTRYINDEX, timer.handlerFunc);

        this.threads.add(thread);

        if (timer.periodic) {
          timer.elapsed = 0;
        } else {
          timers.delete(timer);

          /// TODO: better way to clean references.
          // If the timer isn't periodic, the callback reference can be collected.
          ///luaL_unref(timer.handlerFunc);
        }
      }
    }

    for (let thread of threads) {
      thread.sleep -= dt;

      if (thread.sleep <= 0) {
        this.currentThread = thread;

        let L = thread.L;
        let status = lua_resume(L, this.L, 0);

        if (status === LUA_OK) {
          threads.delete(thread);
        } else if (status === LUA_YIELD) {
          thread.sleep = luaL_checknumber(L, 1);
        } else {
          console.log('[JS] Something went wrong during execution');
          console.log(to_jsstring(luaL_tolstring(L, -1)));
          lua_pop(L, 2);
        }
      }
    }

    this.t = t;
  }

  /**
   * @param {JassHandle} handle
   * @return {JassHandle}
   */
  addHandle(handle) {
    if (handle.handleId === -1) {
      let handleId;

      if (this.freeHandles.length) {
        handleId = this.freeHandles.pop();
      } else {
        handleId = this.handle++;
      }

      this.handles[handleId] = handle;

      handle.handleId = handleId;
    }

    return handle;
  }

  /**
   * @param {JassHandle} handle
   */
  freeHandle(handle) {
    if (handle.handleId !== -1) {
      this.freeHandles.push(handle.handleId);

      this.handles[handle.handleId] = null;

      handle.handleId = -1;
    }
  }

  /**
   * @param {string|number|null} name
   */
  call(name) {
    let L = this.L;

    if (typeof name === 'string') {
      lua_getglobal(L, name);
    } else if (typeof name === 'number') {
      lua_rawgeti(L, LUA_REGISTRYINDEX, name);
    }

    if (lua_pcall(L, 0, 0, 0)) {
      console.log('Something went wrong during execution');
      console.log(to_jsstring(luaL_tolstring(L, -1)));
      lua_pop(L, 2);
    }
  }

  /**
   * @param {string} code
   * @param {boolean} isJass
   */
  run(code, isJass) {
    let L = this.L;

    if (isJass) {
      code = jass2lua(code);
    }

    if (luaL_loadstring(L, to_luastring(code))) {
      console.log('Something went wrong during execution');
      console.log(to_jsstring(luaL_tolstring(L, -1)));
      lua_pop(L, 2);
    }

    if (lua_pcall(L, 0, 0, 0)) {
      console.log('Something went wrong during execution');
      console.log(to_jsstring(luaL_tolstring(L, -1)));
      lua_pop(L, 2);
    }
  }

  /**
   * @param {War3Map} map
   */
  open(map) {
    this.map = map;

    let file = map.get('war3map.j') || map.get('war3map.lua') || map.get('scripts\\war3map.j') || map.get('scripts\\war3map.lua');
    let isJass = file.name.endsWith('.j');

    this.run(file.text(), isJass);
  }
}
