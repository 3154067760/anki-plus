module.exports = {
  apps: [{
    name: 'anki-plus',
    script: 'server.js',
    cwd: '/var/www/anki-plus',
    exec_mode: 'fork',
    instances: 1,
    env: {
      PORT: 3030,
      DATA_DIR: '/var/www/anki-plus/data'
    },
    autorestart: true,
    max_memory_restart: '300M'
  }]
};
