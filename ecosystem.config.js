module.exports = {
  apps: [{
    name: 'anki-plus',
    script: 'server.js',
    cwd: '/var/www/anki_plus',
    exec_mode: 'fork',
    instances: 1,
    env: {
      PORT: 3030,
      DATA_DIR: '/var/www/anki_plus/data'
    },
    autorestart: true,
    max_memory_restart: '300M'
  }]
};
