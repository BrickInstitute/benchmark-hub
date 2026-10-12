# Ölçüm yöntemi

Bu dosya, ölçümle ilgili kararları ve gerekçelerini tutar. Kod değişince burası
da değişmeli; aralarında fark varsa doğru olan budur ve kod düzeltilir.

## Temel kural

**AI tespit eder, yazılım karar verir.** Durum, koordinat, payda ve yüzde
model yanıtından değil yazılımdan gelir. Model yalnızca iki şey söyler:
hangi basamağa düştüğü ve sayfada okuduğu metin.

## Karşılaştırma nesnesinin düzeyleri

| Düzey | Banka örneği | Veritabanı |
|---|---|---|
| Sayfa | İhtiyaç kredisi sayfası | `Benchmark` |
| Bölüm | Kredi ürünleri alanı | `Region` |
| Özellik | Faiz görünürlüğü | `Criterion.featureId` |
| Gözlem | Bu sayfadaki sonucu | `Observation` |
| Kanıt | Gördüğü metin ve kutusu | `Evidence` |
| Davranış | Vade değişince taksitin güncellenmesi | `Observation.interactionVerified` |

Bir bölüm birden çok özellik içerebilir; aynı özellik birden çok bölümde
görünebilir. Kurum düzeyinde bir kez sayılır, yerleşim analizinde iki konum da
korunur.

## Özellik sözlüğü

Ölçüt kodu (`B03`) bir katalog adresidir ve değişebilir. **Özellik kimliği**
(`loan.calculator.level`) işlevin kalıcı adıdır. Bankalar aynı işlevi farklı
adlandırır — "Kredini hesapla", "Taksitini öğren" — ve karşılaştırmayı mümkün
kılan şey bu ortak kimliktir.

Her ölçüt şunları taşır:

- `featureId` — kalıcı işlev kimliği
- `dictionaryVersion` — anlamı değişince artar; gözlemler hangi sürümle
  yapıldığını taşır, böylece yeniden tanımlama eski kayıtları sessizce
  yeniden yorumlamaz
- `requiredEvidence` — sayılması için görünmesi gerekenler
- `exclusions` — sayılmayacak olanlar
- `scopeRegions` — kanıtın alınabileceği bölüm türleri

`requiredEvidence` ve `exclusions` hem modelin istemine hem de insan
etiketleyicinin kuralına girer; ikisi aynı tanımı kullanmazsa uyum testi
anlamsız olur.

## Kanıtın bağlam sınırı

Bir ölçüt yalnızca kendi bölümlerinden kanıt alabilir. Kredi faizi ölçütü,
sayfanın başka yerindeki **mevduat faizini** kanıt sayamaz. Sınır olmadan
sayfadaki herhangi bir rakam, sayı hakkındaki herhangi bir iddiayı
"kanıtlayabilir".

Kapsam dışında kalan alıntı `outOfScope` olarak işaretlenir ve gözlem
`UNKNOWN` olur. Bu, "sayfada hiç yok" demekten farklıdır ve kullanıcıya farklı
yazılır.

## Dört durum ve asimetrik doğrulama

`present` kanıtla ispatlanır. `absent` sayfanın tamamı hakkında bir iddiadır ve
DOM'dan ispatlanamaz — telefon numarası bir görselin içindeyse DOM'da hiç
geçmez. İçerik ölçen kalıplarda deterministik `absent`, model teyidine kadar
yayınlanmaz (`awaitingConfirmation`).

Tarama hatası hiçbir koşulda `absent` üretmez.

## Gözlem türü

| Tür | Anlamı |
|---|---|
| `DOM` | Sayfa yapısından alındı |
| `VISUAL` | Ekran görüntüsünden okundu |
| `INTERACTION` | Davranış gerçekten denendi ve gözlendi |

Görüntüde hesaplayıcı arayüzü görmek, hesaplayıcının çalıştığını kanıtlamaz.
`interactionVerified` yalnızca davranış denendiğinde doğru olur, asla çıkarımla.

## Yazılımın sahipliğindeki kalıplar

Model şunları yanıtlayamaz:

- **P5 derinlik** — tıklama sayısı gezilerek bulunur, tahmin edilmez
- **P6 sayım** — sayılması gerekir
- **P2 konum** — model yalnızca öğeyi işaret eder; konum doğrulanmış kutudan
  hesaplanır

## Yaygınlık ve kapsam

İki ayrı sayı, ikisi de gösterilir:

> Değerlendirilebilen 40 kurumun 28'inde bulundu: **%70**.
> İnceleme kapsamı: **40/50 kurum (%80)**.

İlki bulgudur, ikincisi o bulguya ne kadar güvenileceğidir. Birincisini
ikincisi olmadan göstermek sonucu olduğundan güçlü gösterir.

Paydaya yalnızca `present` + `absent` girer. `unknown`, `not_applicable` ve
teyit bekleyen gözlemler girmez ama **görünür** şekilde ayrı raporlanır.

Payda 8'in altındaysa yüzde üretilmez, yalnızca ham sayı gösterilir.

## İstatistik ile örnek gösterimi ayrıdır

- **İstatistik:** kohorttaki bütün uygun kayıtlar.
- **Örnek gösterimi:** özelliği iyi gösteren birkaç kayıt.

Hedefe en çok benzeyen beş örneği bulup onların oranını "sektörün oranı" diye
sunmak yanlı sonuç üretir. Benzerlik sıralaması yalnızca örnek seçiminde
kullanılır.

## Öneri üretme

Öneri şu zincir tamamlanmadan üretilmez:

```
Doğrulanmış gözlem + kullanıcının hedefi + uygulanabilir kural + gerekçe
```

"Rakiplerin çoğunda var" tek başına öneri değildir. Yaygın olması iyi
uygulanmış veya gerekli olduğunu göstermez. "Eklenirse dönüşüm %15 artar" gibi
bir sonuç, deney verisi olmadan hiç üretilmez.

## Yeni özellik adayları

Model sözlükte olmayan bir şey fark ederse `FeatureCandidate` olarak kaydedilir.
İncelenmemiş aday hiçbir istatistiği etkilemez. Sözlüğe eklendiğinde eski
yakalamalar o özellik için **yeniden analiz edilmelidir** — kimse bakmadığı
için `absent` sayılamaz.

## Henüz yapılmamış olanlar

- **Uyum testi.** İki insan etiketleyicinin aynı sayfalarda anlaşıp
  anlaşmadığı ölçülmedi. Bu yapılmadan hiçbir doğruluk iddiası kurulamaz.
- **Kontrol kümesi.** Yanlış "var" oranı, kaçırma oranı, kanıtın doğru bölgeye
  bağlanma oranı ve `unknown` oranı ölçüt bazında ölçülmeli. İstemlerin
  geliştirildiği kurumlar test kümesinde bulunmamalı.
- **P5 derinlik gezintisi.**
- **Etkileşim doğrulaması** (`INTERACTION` gözlem türü hiç üretilmiyor).
- **Ekran görüntüsü girişi** — planda iki giriş var, yalnızca URL çalışıyor.

Bu liste kısalmadan "güvenilir ölçüyoruz" denmemeli. Şu an kurulabilecek iddia
şudur: *belirli ölçütleri kanıta bağlayarak ölçüyoruz ve ölçemediğimizi
ölçemedik diye işaretliyoruz.*
