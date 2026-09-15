const { getHistoricalRates } = require('dukascopy-node');
const fs = require('fs');
(async () => {
  const data = await getHistoricalRates({
    instrument: 'xauusd',
    dates: { from: new Date('2003-01-01'), to: new Date('2026-07-25') },
    timeframe: 'd1',
    format: 'json',
    volumes: true,
    retryCount: 3
  });
  console.log('daily bars:', data.length);
  const f = data[0], l = data[data.length - 1];
  console.log('first:', new Date(f.timestamp).toISOString().slice(0,10), f.close);
  console.log('last :', new Date(l.timestamp).toISOString().slice(0,10), l.close);
  fs.writeFileSync('xauusd_d1.json', JSON.stringify(data));
  console.log('written xauusd_d1.json', (fs.statSync('xauusd_d1.json').size/1024).toFixed(0), 'KB');
})();
