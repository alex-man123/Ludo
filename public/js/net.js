// Conexiunea Socket.IO cu serverul. Se conectează la aceeași origine ca pagina
// (http://IP:port în rețeaua locală sau https://… pe internet, cu wss automat).

const TIMEOUT_MS = 8000;

export class NetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class Net {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
  }

  /** Conexiunea se deschide doar când este folosit modul online. */
  connect() {
    if (this.socket) return this.socket;
    if (typeof window.io !== 'function') {
      throw new NetError('unavailable', 'Biblioteca pentru jocul online nu s-a încărcat. Pornește aplicația cu „npm start” și deschide-o prin adresa serverului.');
    }
    this.socket = window.io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    for (const [event, fns] of this.handlers) fns.forEach(fn => this.socket.on(event, fn));
    return this.socket;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    this.socket?.on(event, fn);
  }

  get connected() { return Boolean(this.socket?.connected); }

  /** Așteaptă conexiunea (sau eșuează clar dacă serverul nu răspunde). */
  ready() {
    const s = this.connect();
    if (s.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new NetError('unavailable', 'Serverul nu este disponibil. Verifică adresa și dacă serverul rulează.')); }, TIMEOUT_MS);
      const ok = () => { cleanup(); resolve(); };
      const cleanup = () => { clearTimeout(timer); s.off('connect', ok); };
      s.on('connect', ok);
    });
  }

  /** Trimite o intenție și așteaptă răspunsul serverului. */
  async request(event, payload = {}) {
    await this.ready();
    return new Promise((resolve, reject) => {
      this.socket.timeout(TIMEOUT_MS).emit(event, payload, (err, res) => {
        if (err) return reject(new NetError('timeout', 'Serverul nu a răspuns la timp. Verifică conexiunea.'));
        if (!res?.ok) return reject(new NetError(res?.code || 'server', res?.message || 'Eroare de server.'));
        resolve(res);
      });
    });
  }
}

export const net = new Net();
