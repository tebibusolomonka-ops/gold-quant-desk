const { getHistoricalRates } = require('dukascopy-node');
const fs = require('fs');

const FROM = process.argv[2] || '2024-01-01';
const TO   = process.argv[3] || '2024-02-01';
const OUT  = process.argv[4] || 'xauusd_m15.json';

(async () => {
  try {
    const data = await getHistoricalRates({
      instrument: 'xauusd',
      dates: { from: new Date(FROM), to: new Date(TO) },
      timeframe: 'm15',
      format: 'json',
      volumes: true,
      retryCount: 3
    });
    console.log('bars:', data.length);
    if (data.length) {
      const f = data[0], l = data[data.length - 1];
      console.log('first:', new Date(f.timestamp).toISOString(), f.open, f.high, f.low, f.close, 'vol=', f.volume);
      console.log('last :', new Date(l.timestamp).toISOString(), l.open, l.high, l.low, l.close, 'vol=', l.volume);
      fs.writeFileSync(OUT, JSON.stringify(data));
      console.log('written ->', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB');
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
