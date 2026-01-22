# Balance Track

Hafif bir masaustu gelir-harcama takip uygulamasi. Veriler lokalde saklanir, otomatik analiz ve guncelleme destegi sunar.

## Calistirma

```bash
npm install
npm run dev
```

## Paketleme

```bash
npm run build
```

## GitHub guncelleme ayarlari

- `package.json` icindeki `build.publish` alaninda `owner` ve `repo` degerlerini guncelleyin.
- GitHub Actions `release` is akisi her `main` push'unda yeni surum ve installer olusturur.
- `electron-updater` otomatik guncelleme icin GitHub Release'lerini kullanir.

## Veri konumu

Uygulama verisi `balance-data.json` olarak sistemin `userData` klasorunde saklanir.
