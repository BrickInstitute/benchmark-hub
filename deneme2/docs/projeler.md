# Projeler: benchmark çalışması akışı

Bu doküman proje katmanını anlatır: ne olduğunu, veride nasıl durduğunu, hangi
adımlardan geçtiğini, hangi kurallara uyduğunu ve nerede eksik kaldığını.
Ölçümün genel ilkeleri `docs/olcum-yontemi.md` dosyasındadır; burası onun
üzerine kurulur ve onunla çelişmemelidir.

## Neden var

Proje katmanından önce sistemin tek girdisi bir URL'ydi: hedef sayfa verilir,
muadilleri model bulur, sonuç bir kohort olur (`/api/cohort`). Bu akışta:

- karşılaştırılacak site listesi önceden görülemiyor, düzenlenemiyordu;
- çalışmaya bir ad, bir kapsam ("Türkiye'deki bankaların kredi kartı
  sayfaları") verilemiyordu;
- yalnızca kapalı sorular (ölçüt kataloğu) soruluyordu. "Hero'da ne
  söyleniyor, sayfa hangi modüllerden oluşuyor, hangi vaatler veriliyor"
  gibi açık sorular yoktu.

Proje katmanı bu üçünü ekler. Mevcut ölçüm hattını (`measurement/`) değiştirmez,
onu çağırır.

## Kavramlar

| Kavram | Ne | Tablo |
|---|---|---|
| Proje | Adı ve tanımı olan bir benchmark çalışması. Ör. "Kredi kartı landing sayfaları". | `Project` |
| Hedef (site) | Projenin listesindeki bir kurum ve analiz edilecek sayfası. | `ProjectTarget` |
| Yakalama | Bir hedefin bir çalıştırmadaki ekran görüntüsü + DOM'u. Eskisinden farkı yok. | `Benchmark` |
| Ölçüt gözlemi | Sektör kataloğundaki kapalı sorunun bu sayfadaki cevabı. Eskisinden farkı yok. | `Observation`, `Evidence` |
| Sayfa analizi | Hero, modüller, değer önerileri. Yeni. | `PageAnalysis`, `PageElement` |
| Proje özeti | Listedeki tüm sayfalar üzerinden sayım. Saklanmaz, her istekte hesaplanır. | — (`summary.ts`) |

Bir proje şunları sabitler: **sayfa konusu** (`pageTopic`, ör. "kredi kartı"),
**sayfa türü** (`pageRole`, ör. `DECISION`), **sektör** (hangi ölçüt
kataloğunun kullanılacağı), **görünüm** (masaüstü/mobil) ve **ülke**. Bir
projedeki bütün sayfalar aynı koşullarda ölçülür; masaüstü ve mobil
karşılaştırması iki ayrı projedir.

## Akış

```
1. Proje oluştur        POST /api/projects                 (ad + tanım, isteğe bağlı konu/tür/sektör)
2. Liste oluştur        POST /api/projects/:id/discover    (model kurum önerir, yazılım sayfayı bulur)
   Listeyi düzenle      POST /api/projects/:id/targets     (site ekle: alan adı ya da tam adres)
                        PATCH/DELETE .../targets/:tid       (hariç tut, sil, adresi düzelt, adı düzelt)
                        POST /api/projects/:id/resolve     (yalnız alan adı girilmişlerin sayfasını bul)
3-4. Yakala + analiz et POST /api/projects/:id/run         (her dahil site için yakalama + ölçüt + sayfa analizi)
5. Sonuçlar             GET  /api/projects/:id/summary
```

Arayüz: `/projects` (liste + yeni proje), `/projects/:id` (Site listesi /
Sonuçlar / Ayarlar sekmeleri).

### 1. Proje oluşturma

Zorunlu alanlar ad ve tanım (`brief`). Tanım serbest metindir ve modelin
okuduğu tek şeydir: "Türkiye'deki bankaların kredi kartı başvuru sayfaları,
dijital bankalar dahil" gibi.

`pageTopic`, `pageRole` ve sektör boş bırakılabilir. Boş olanları ilk
öneri/çalıştırma sırasında model tanımdan çıkarır (`interpretBrief`) ve projeye
**yazar**; sonraki çalıştırmalar aynı değerleri kullanır. Kullanıcının girdiği
değer her zaman modelinkinden önce gelir. Üçü de elle girilirse model hiç
çağrılmaz.

Sektör çıkarılırken modele mevcut sektörlerin listesi verilir ve uyan varsa onu
kullanması istenir. Amaç `olcum-yontemi.md`'de anlatılan "aynı sektör iki ayrı
adla iki kovaya düşüyor" sorununu proje tarafında azaltmaktır; tamamen çözmez.

### 2. Site listesi

**Öneri (`discover`).** İki adım:

1. `proposeInstitutions`: model, tanıma uyan N kurumun **adını ve ana alan
   adını** verir. Alt sayfa adresi istemez; modelin yazdığı derin bağlantıya
   güvenilmez. Listede zaten olan alan adları (hariç tutulanlar dahil) modele
   "bunları koyma" diye verilir ve dönen cevapta yine de varsa yazılım atar.
2. `resolveTargetPage`: yazılım her sitenin ana sayfasını gerçekten açar,
   sayfa konusuna uyan bağlantıyı **sayfada gerçekten bulunan bağlantılar**
   arasından seçtirir (önce menü, yoksa sitemap). Model bir adres yazamaz,
   yalnızca listeden numara seçer. Bulunamazsa hedef `resolveState = FAILED`
   olur ve nedeni (`resolveNote`) listede görünür. Kullanıcı adresi elle
   girer. Sayfa türü `ENTRY` ise ana sayfanın kendisi kullanılır.

Bu iki fonksiyon `measurement/peer-discovery.ts`'deki kohort akışının
parçalarını yeniden kullanır (`resolveEquivalentPage`,
`resolveEquivalentFromSitemap`, `askJson`).

**Elle ekleme.** Kullanıcı ya alan adı (`enpara.com`) ya tam adres girer:

- Tam adres (yolu olan URL): olduğu gibi alınır, `foundVia = "manual"`. Bu
  kullanıcının bilinçli seçimidir; konu kontrolüne takılmaz (aşağıda).
- Yalnız alan adı: `resolveState = PENDING` olur, "adresini bul" (`/resolve`)
  ile yazılım sayfayı arar.

**Kurallar.**

- **Bir projede bir kurum bir kez.** `ProjectTarget` üzerinde
  `@@unique([projectId, domain])` var. Aynı bankanın iki sayfası iki banka
  sayılırsa her yüzde bozulur. Bu, `CohortMember` üzerindeki kuralın proje
  karşılığıdır. Alan adı `www.` atılarak ve küçük harfe çevrilerek
  karşılaştırılır.
- **Hariç tutma ile silme farklıdır.** Hariç tutulan (`included = false`)
  hedef listede kalır, çalıştırılmaz, sayılmaz ve bir sonraki öneride geri
  gelmez. Silinen hedef bir sonraki öneride yeniden önerilebilir.
- **Adres değişirse eski sonuç bağı koparılır.** `url` değişince
  `benchmarkId` boşaltılır ve `runState = IDLE` olur. Eski yakalama
  veritabanında kalır ama bu projenin özetine girmez; hedef yeniden
  çalıştırılmalıdır.

### 3. Yakalama ve 4. analiz (`run`)

Her dahil ve adresi hazır hedef için, sırayla:

1. `measurement/analyze.ts` → `analyze()`. Yakalama, kalite kapısı,
   bölümleme, deterministik ölçütler, model ölçütleri, kanıt doğrulama. Bu,
   kohort akışında da kullanılan hattın kendisidir; proje için değiştirilmedi.
   Sonuç bir `Benchmark` satırıdır; `ProjectTarget.benchmarkId` buna bağlanır.
2. Kalite kapısından geçmeyen yakalama: hedef `FAILED`, sayfa analizi
   `SKIPPED`. Tarama hatası hiçbir zaman "yok" üretmez.
3. **Konu kontrolü.** Sayfayı yazılım seçtiyse (menü/sitemap) sayfa metninde
   proje konusunun geçip geçmediğine bakılır (`topicMatches`, kohorttaki aynı
   kontrol). Geçmiyorsa hedef `FAILED` olur ve kullanıcıdan adresi düzeltmesi
   istenir: alakasız bir sayfa paydaya girerse her yüzdeyi bozar. Elle girilen
   adreslere bu kontrol uygulanmaz.
4. `projects/page-analysis.ts` → `describePage()`. Hero, modüller, değer
   önerileri (aşağıda). Sonuç `PageAnalysis` + `PageElement` satırlarıdır.

Varsayılan olarak yalnızca henüz `DONE` olmayan hedefler çalışır. `force: true`
hepsini yeniden çalıştırır. Yeni çalıştırma yeni bir `Benchmark` üretir; eskisi
geçmiş olarak kalır, hedef en yenisini gösterir.

**Modlar.**

| Mod | Model çağrısı | Ne üretir |
|---|---|---|
| `full` (varsayılan) | site başına 2 (ölçütler + sayfa analizi) | her şey |
| `capture_only` | yok | yakalama + deterministik ölçütler. Sayfa analizi `SKIPPED`. Listeyi ucuza kontrol etmek ya da anahtarsız ortamda denemek için. |

### Sayfa analizi: hero, modüller, değer önerileri

Ölçüt kataloğu kapalı soru sorar ("hesaplayıcı var mı, hangi düzeyde"). Sayfa
analizi açık soruları cevaplar ama aynı sözleşmeyle:

**Model ne verir:**

- Hero: ana başlık ve alt başlık (**birebir metin**), hero görselinin türü.
- Modüller: sayfadaki bölümler yukarıdan aşağıya. Her biri için tür (sabit
  sözlükten) ve bölümün **içinden birebir bir metin** (`anchorQuote`).
- Değer önerileri: vaadin birebir metni ve teması (sabit sözlükten).

**Model ne vermez:** koordinat, sıra, konum, sayı, güven skoru.

**Yazılım ne yapar** (`verifyDescription`, saf fonksiyon, modelsiz test
edilebilir):

- Her alıntıyı `findEvidence` ile DOM'da arar. Bulunursa kutusu ve konumu
  (`ilk_ekran` / `ilk_kaydirma` / `sayfa_alti`) yazılımla hesaplanır.
- **Bulunamayan alıntı `verified = false` olarak saklanır**, nedeniyle
  birlikte (`note`). Denetim için tutulur, hiçbir sayıya girmez. Doğrulanamayan
  öğe sayısı sistemin sağlık sinyali olarak sonuçlarda gösterilir.
- Hero başlığı sayfada bulunsa bile ilk ekranda değilse hero sayılmaz.
- Modülün kutusu: alıntıyı içeren en küçük DOM bölgesi (`Region` ile aynı
  kaynaktan), yoksa alıntının kendi kutusu. Model kutu çizmez.
- Modüllerin sırası modelin listeleme sırasından değil kutuların dikey
  konumundan hesaplanır.
- Aynı türden iki modül aynı kutuya düşerse bir sayılır.
- Sözlükte olmayan tür veya tema **zorla eşlenmez, atılır** ve
  `PageAnalysis.note` alanına yazılır.
- **Hero düğmeleri (CTA) modelden istenmez.** DOM'daki
  `InteractiveElement.primaryCta` (düğme görünümlü, eylem fiili içeren,
  menü/altbilgi/çerez dışı) ve ilk ekranda olanlar alınır
  (`heroCtasFromDom`). Kutuları kesindir (`source = DOM_ELEMENT`).

**Tek istisna:** hero görselinin türü (`heroVisual`: ürün görseli, insan
fotoğrafı, illüstrasyon...) ekran görüntüsünden okunur ve doğrulanacak bir
metni yoktur. Ayrı alanda tutulur, arayüzde "ekran görüntüsünden okundu" diye
belirtilir. Bu, `olcum-yontemi.md`'deki `VISUAL` gözlem türüyle aynı
statüdedir.

**Sözlükler** (`src/lib/projects/vocabulary.ts`): `MODULE_TYPES` (20 tür),
`VALUE_THEMES` (11 tema), `HERO_VISUALS` (7 tür). Her girdinin açıklaması hem
modelin istemine hem arayüze aynen girer. Anahtar eklemek serbesttir. Bir
anahtarı yeniden adlandırmak veya silmek eski analizlerin anlamını değiştirir,
bu yüzden ilgili projelerin yeniden çalıştırılmasıyla birlikte yapılmalıdır.

### 5. Proje özeti

`GET /api/projects/:id/summary` (`summary.ts`). Tamamen sayımdır, model
çağırmaz. Kurallar:

- **Kim sayılır.** Dahil + `runState = DONE` + kalite kapısından geçmiş +
  sayfa analizi `DONE` olan siteler. `capture_only` ile çalışmış siteler
  ölçüt tablosuna girer ama hero/modül/vaat sayımlarına girmez.
- **Kapsam ayrı gösterilir.** "15 dahil siteden 12'si analiz edildi (%80)".
  Bulgu kapsamı olmadan gösterilmez.
- **Yüzde eşiği.** Analiz edilen site sayısı `MIN_DENOMINATOR_FOR_PERCENT`
  (8) altındaysa yüzde üretilmez, yalnızca "3/5" gibi sayılar gösterilir.
- **"Bulunamadı", "yok" demek değildir.** Bir modülün 12 siteden 7'sinde
  görülmesi, kalan 5'te olmadığını kanıtlamaz: model kaçırmış olabilir. Sayılar
  "en az N sitede görüldü" diye okunur ve arayüz bunu yazar. Bu yüzden sayfa
  analizi için `ABSENT` durumu yoktur.
- **Modül sırası.** Her modül türü için, o türün sayfadaki modüller arasındaki
  konumunun medyanı (`#1`, `#2`...). "SSS genelde sayfanın sonunda" gibi
  okumalar buradan çıkar.
- **Değer önerileri.** Tema başına kaç kurumun kullandığı ve her kurumdan bir
  birebir örnek.
- **Hero tablosu.** Kurum başına doğrulanmış başlık, alt başlık, düğmeler,
  görsel türü, ilk ekrandaki vaatler ve sayfa akışı (modül sırası).
- **Ölçütler.** Sektör kataloğundaki ölçütlerin bu projenin sayfaları
  üzerindeki dağılımı (`patterns.distribution`). Teyit bekleyen gözlemler
  sayılmaz, `UNKNOWN` olanlar ayrıca gösterilir.

## Arka plan işleri

Bir çalıştırma 15 site × (yakalama + 2 model çağrısı) demektir, dakikalar
sürer, tek bir HTTP isteğine sığmaz. Bu yüzden `discover`, `resolve` ve `run`
uçları işi başlatıp hemen `202` döner. İş ilerlemesini veritabanına yazar
(`Project.jobKind/jobState/jobNote`, hedeflerde `resolveState/runState`),
arayüz iş sürerken 3 saniyede bir sorgular.

`src/lib/projects/jobs.ts`:

- **Proje başına tek iş.** Bellekteki bir kayıt (`globalThis.__bhProjectJobs`)
  ve veritabanı durumu birlikte tutulur. İkinci istek `409` alır. İş
  sürerken proje ayarları değiştirilemez ve proje silinemez. Liste düzenlemeye
  izin verilir: iş her hedefi işlemeden önce yeniden okur, bu arada hariç
  tutulan ya da silinen hedefi atlar. Kullanıcı adres girdiyse yazılımın
  bulduğu adres onun üzerine yazılmaz.
- **Yeniden başlatma.** Sunucu yeniden başlarsa çalışan iş sessizce ölür.
  `reconcile()` (her proje okumasında çağrılır), veritabanında `RUNNING`
  görünen ama bu süreçte karşılığı olmayan işi `FAILED` ve "yarıda kaldı"
  olarak işaretler, yarıda kalan hedefleri `IDLE`/`PENDING`'e geri alır.
  Tamamlanmış hedefler korunur; "Analizi başlat" kalanlardan devam eder.
- **Tek sunucu varsayımı.** İş kaydı süreç belleğindedir. Railway'de birden
  çok örnek (replica) çalıştırılırsa iki örnek aynı projede iş başlatabilir.
  Ölçeklemeden önce bu kayıt veritabanı kilidine ya da bir kuyruğa (ör.
  pg-boss) taşınmalıdır.

## Veri modeli özeti

```
Project 1─* ProjectTarget *─1 Benchmark 1─1 PageAnalysis 1─* PageElement
   │                              │
   └─* Sector                     ├─* Region
                                  └─* Observation ─* Evidence
```

- `Project`: ad, tanım, konu, tür, görünüm, ülke, sektör, varsayılan öneri
  sayısı, iş durumu.
- `ProjectTarget`: kurum, alan adı (projede benzersiz), adres, kaynak
  (`AI_SUGGESTED`/`MANUAL`), dahil mi, öneri gerekçesi, adres bulma durumu ve
  notu, çalıştırma durumu ve notu, son yakalama.
- `PageAnalysis`: bir yakalamanın sayfa analizi; durum (`DONE`/`SKIPPED`/
  `FAILED`), not, hero görsel türü, model ve token kullanımı, ham model yanıtı.
- `PageElement`: tek tablo, `kind` ile ayrılır (`HERO_HEADLINE`,
  `HERO_SUBHEADLINE`, `HERO_CTA`, `MODULE`, `VALUE_PROP`). Kategori, metin,
  başlık, sıra, doğrulandı mı, kutu, konum, not.

Şema değişikliği yalnızca **yeni tablo ve yeni ilişki** ekler, mevcut
sütunlara dokunmaz. `start.sh`'deki `prisma db push` açılışta tabloları
oluşturur; veri kaybı uyarısı beklenmez.

## API

Hepsi oturum ister (middleware). Hatalar `{ error }` ile döner; doğrulama
hatası `400`, çakışma `409`, yok `404`.

| Uç | Gövde | Ne yapar |
|---|---|---|
| `GET /api/projects` | — | Projeler + site sayıları |
| `POST /api/projects` | `name, brief, pageTopic?, pageRole?, viewport?, country?, sectorSlug?, targetCount?` | Boş proje oluşturur |
| `GET /api/projects/:id` | — | Proje + liste + iş durumu + `modelAvailable` + sektör listesi |
| `PATCH /api/projects/:id` | yukarıdaki alanlar | Ayarları değiştirir (iş sürerken `409`) |
| `DELETE /api/projects/:id` | — | Projeyi ve listeyi siler; yakalamalar kalır |
| `POST /api/projects/:id/discover` | `count?` | Öneri işi başlatır (`202`) |
| `POST /api/projects/:id/resolve` | — | Adresi olmayanların sayfasını bulur (`202`) |
| `POST /api/projects/:id/targets` | `input, institution?` | Site ekler. `input` alan adı ya da tam adres |
| `PATCH /api/projects/:id/targets/:tid` | `institution?, included?, url?` | Hedefi düzenler. `url: ""` adresi temizler |
| `DELETE /api/projects/:id/targets/:tid` | — | Hedefi siler |
| `POST /api/projects/:id/run` | `mode?, force?, targetIds?` | Yakalama + analiz işi başlatır (`202`) |
| `GET /api/projects/:id/summary` | — | Proje özeti |

## Dosyalar

| Dosya | Sorumluluk |
|---|---|
| `prisma/schema.prisma` | `Project`, `ProjectTarget`, `PageAnalysis`, `PageElement` ve enum'lar (dosyanın sonu) |
| `src/lib/projects/vocabulary.ts` | Modül, tema ve hero görsel sözlükleri |
| `src/lib/projects/discovery.ts` | Tanımı yorumlama, kurum önerme, sayfa bulma, girdi normalleştirme |
| `src/lib/projects/page-analysis.ts` | Sayfa analizi: model çağrısı, doğrulama (`verifyDescription`), kayıt |
| `src/lib/projects/jobs.ts` | Arka plan işleri, kilit, yeniden başlatma kurtarması |
| `src/lib/projects/summary.ts` | Proje özeti (sayım) |
| `src/lib/projects/http.ts` | Rota yardımcıları (hata, slug) |
| `src/app/api/projects/**` | API uçları |
| `src/app/(dashboard)/projects/**` | Sayfalar |
| `src/components/projects/*` | Liste, sonuçlar, ayarlar bileşenleri |

Mevcut koda dokunulan yerler:

- `measurement/peer-discovery.ts`: `askJson` dışa açıldı, `maxTokens`
  parametresi eklendi. Davranış aynı.
- `measurement/capture.ts`: isteğe bağlı `CHROMIUM_EXECUTABLE_PATH` ortam
  değişkeni. Yalnızca kurulu Chromium'un Playwright sürümüyle eşleşmediği
  makineler için; Docker imajında tanımsızdır, davranış değişmez.
- `components/layout/sidebar.tsx`: "Projeler" menüsü.

## Yerel geliştirme

```bash
cp .env.example .env            # DATABASE_URL, APP_USERS, AUTH_SECRET doldurun
npx prisma db push
node prisma/seed.mjs
npx tsx scripts/seed-criteria.ts   # bankacılık kataloğu; diğerleri için data/criteria/*.json
npm run dev
```

`ANTHROPIC_API_KEY` yoksa: öneri ve tam analiz kapalıdır, arayüz bunu üstte
gösterir. Siteler elle (tam adresle) eklenip "Sadece yakala" çalıştırılabilir.
Bu durumda projenin sektörü, konusu ve türü elle girilmiş olmalıdır.

## Doğrulama durumu ve bilinen eksikler

Bu katman yazılırken şunlar **gerçek çalıştırmayla** denendi (yerel Postgres,
gerçek Chromium yakalaması, yerelde sunulan iki örnek banka sayfası): proje
oluşturma, elle site ekleme, tekrar ve geçersiz girdi engeli, adres düzeltme,
"sadece yakala" çalıştırması, iş çakışması (`409`), yarıda kalan işin
kurtarılması, `verifyDescription`'ın gerçek bir yakalama üzerinde doğru ve
uydurma alıntıları ayırması, proje özeti ve arayüz.

Şunlar **denenmedi**, ilk canlı kullanımda gözle kontrol edilmeli:

- **Model çağrıları** (`interpretBrief`, `proposeInstitutions`,
  `describePage`) gerçek API ile çalıştırılmadı. İstemler ve şemalar
  mevcut çağrılarla aynı kalıpta yazıldı, ama ilk birkaç projede
  doğrulanamayan öğe oranına (`health`) ve atılan sözlük dışı çıktılara
  (`PageAnalysis.note`) bakılmalı.
- **Gerçek banka siteleri** üzerinde sayfa bulma ve yakalama bu katmanla
  denenmedi (aynı fonksiyonlar kohort akışında kullanılıyor).

Bilinen eksikler:

- **Uyum testi yok.** `olcum-yontemi.md`'deki uyarı burada da geçerli: modül ve
  tema sınıflandırmasının iki insanın etiketiyle ne kadar örtüştüğü
  ölçülmedi.
- **Kanıtlı rapor ile bağ yok.** Proje sonuçları `/kanitli-rapor`
  ekranına düşmez; o ekran hâlâ benchmark-collector'dan gelen dosyaları
  gösterir.
- **Proje yakalamaları kohorta yazılmaz.** Bu yüzden `/benchmarks/:id`
  detay sayfasındaki "muadiller" görünümü proje yakalamalarında muadil
  göstermez. Proje içi karşılaştırma `/projects/:id` sonuçlar sekmesindedir.
- **Kurum kimliği alan adıdır.** Aynı kurumun iki alan adı varsa (ör. bir
  banka ve dijital markası) ikisi iki kurum sayılır. Çoğu durumda bu doğru
  (Enpara ve QNB ayrı ürünlerdir), ama kararı kullanıcı listeyi düzenlerken
  verir.
- **Ayar değişikliği eski sonuçları yeniden yorumlamaz.** Konu, tür, sektör
  veya görünüm değişirse "Hepsini yeniden çalıştır" gerekir.
- **Hero düğmeleri sezgiseldir.** `primaryCta` eylem fiili listesine bağlıdır
  (`dom-snapshot.ts`, `ACTION_WORDS`); fiil içermeyen düğme kaçabilir.
- **Tek sunucu.** Bkz. "Arka plan işleri".
