# LeafLimits: så fungerar hela projektet

**En förklaring för dig som är ny på det här.** Skriven 2026-09-20. Projekt: MicroHydros (Jensen YH). Författare: BasitMN.

Det här dokumentet förklarar steg för steg hur LeafLimits fungerar, från sensorn i växtlådan till appen i din mobil. Du behöver inga förkunskaper. Svåra ord förklaras i ordlistan i kapitel 2 och även där de dyker upp. Rutorna med "Varför?" förklarar varför vi valde som vi gjorde. Det är ofta det viktigaste att förstå.

> **Så läser du dokumentet.** Vill du bara förstå idén räcker kapitel 1 till 3. Vill du kunna använda systemet: läs kapitel 14. Vill du förstå exakt hur det funkar inuti: läs allt.

<<pagebreak>>

## Innehåll

1. Vad är LeafLimits?
2. Ordlista för nybörjare
3. Helhetsbilden
4. Del 1: Från sensor till server
5. Del 2: Kontrollen av mätvärdena (validering)
6. Del 3: Lagring och grafer
7. Del 4: Kärnan i LeafLimits, gränsvärden och larm
8. Del 5: AI-förslaget från ett foto
9. Del 6: Appen
10. Del 7: Lösenord, nycklar och säkerhet
11. Del 8: Så lades det in på den riktiga servern, säkert
12. Del 9: Så vet vi att det fungerar (tester)
13. Del 10: Var finns allt? (mappar och filer)
14. Del 11: Praktiska guider steg för steg
15. Del 12: Felsökning
16. Vanliga frågor
17. Kända begränsningar och vad som återstår

<<pagebreak>>

## 1. Vad är LeafLimits?

### Bakgrunden: MicroHydros

MicroHydros är en liten prototyp för **hydroponik**, det vill säga att odla växter utan jord, med rötterna i vatten som innehåller näring. I växtlådan sitter en liten dator (en **ESP32-S3**) med sensorer. Den mäter fyra saker:

- temperaturen i luften inne i lådan,
- luftfuktigheten inne i lådan,
- temperaturen i luften utanför lådan,
- temperaturen i vattnet.

Var femte sekund skickar datorn mätvärdena över internet till en server. Servern kontrollerar dem, sparar dem i en databas och visar dem i grafer.

### Problemet

Det gamla systemet visste bara om ett mätvärde var **omöjligt**, till exempel 200 grader, vilket betyder att en sensor är trasig. Det visste inte om ett värde var **dåligt för växten**. Men en basilika, en fikonbuske och en sallad trivs vid helt olika temperaturer. Vad som är "för varmt" beror på vilken växt du har.

### Lösningen: LeafLimits

LeafLimits är ett tillägg som gör att du kan säga vilken växt du har, och som sedan övervakar mätvärdena mot just den växtens gränser.

1. Du **tar ett foto** på växten i appen.
2. En **AI** (Claude) tittar på fotot och föreslår gränsvärden, till exempel "vattnet bör vara mellan 18 och 24 grader".
3. **Du granskar** förslaget, ändrar om du vill och sparar. Inget sparas utan att du trycker på Spara.
4. Systemet markerar varje sensor som **I intervall**, **För låg** eller **För hög**, och skickar ett **larm** när något har legat fel en stund.

> **Liknelse.** Tänk dig en termostat som du kan tala om vilken växt du har, och som dessutom kan titta på en bild för att gissa vilken växt det är. Eller ett trafikljus per sensor: grönt, gult eller rött.

### Vad LeafLimits inte är

LeafLimits **styr ingenting**. Det slår inte på en värmare och stänger inte av en pump. Det övervakar och varnar. Att agera på varningen är fortfarande ditt jobb.

### De tre delarna

| Del | Vad det är | Var det körs |
|---|---|---|
| Appen | En webbapp i din webbläsare (Angular) | Filerna ligger på servern, appen körs i din mobil eller dator |
| Node-RED-fliken "LeafLimits" | Logiken: jämför mätvärden med gränser, tar emot appens anrop, pratar med AI:n | På servern, inuti Node-RED |
| AI-tjänsten | Claude från Anthropic, som tittar på fotot | Hos Anthropic, nås över internet |

## 2. Ordlista för nybörjare

Här är orden du kommer att stöta på, förklarade så enkelt det går.

| Ord | Enkel förklaring |
|---|---|
| ESP32-S3 | En liten billig dator på ett kretskort med WiFi. Den sitter i växtlådan och läser av sensorerna. |
| Firmware | Programmet som körs på ESP32-datorn. Det är skrivet i språket C med ramverket ESP-IDF. |
| Sensor | En liten mätare. Här: SHT31 (temperatur och luftfuktighet) och två DS18B20 (bara temperatur). |
| I2C och 1-Wire | Två sätt för sensorer att prata med datorn över några få ledningar. SHT31 använder I2C. DS18B20 använder 1-Wire. |
| ROM-adress | Ett unikt nummer som varje DS18B20-sensor har inbyggt. Det används för att skilja två sådana sensorer åt på samma ledning. |
| MQTT | Ett enkelt sätt för små enheter att skicka meddelanden. Fungerar som ett postkontor med ämnesbrevlådor. |
| Broker | Postkontoret i MQTT. Här heter det Mosquitto. Alla skickar sina meddelanden dit, och den som prenumererar får dem. |
| Topic | Brevlådans namn, till exempel microhydros/v1/devices/esp32s3-01/telemetry/raw. Ser ut som en filsökväg. |
| Publish och subscribe | Publish = lägga ett meddelande i en brevlåda. Subscribe = säga "jag vill ha allt som hamnar i den här brevlådan". |
| Retained-meddelande | Ett MQTT-meddelande som posten sparar och delar ut till alla nya prenumeranter direkt. Vi använder det för att komma ihåg gränsvärden. |
| JSON | Ett textformat för data, till exempel {"temperatur": 21.5}. Både människor och program kan läsa det. |
| Node-RED | Ett program där du bygger logik genom att koppla ihop rutor (noder) med streck. Ett sådant flöde kallas en flik (tab). |
| Nod och flik | En nod är en ruta som gör en sak. En flik är en samling noder som hör ihop. LeafLimits är en egen flik. |
| InfluxDB | En databas som är gjord för mätvärden över tid (tidsserier). |
| Bucket | En "hylla" i InfluxDB. Vår heter microhydros. |
| Grafana | Ett program som ritar grafer och instrumentpaneler av data i en databas. |
| Docker och container | Ett sätt att köra program i färdigpackade, isolerade lådor. Varje del av servern (Mosquitto, Node-RED, InfluxDB, Grafana) är en container. |
| Server | En dator som alltid är på och som andra kan prata med. Vår ligger hos Hetzner i Helsingfors. |
| API | Ett "beställningsfönster" för program. Appen skickar en förfrågan (till exempel "hämta gränserna") och får ett svar. |
| HTTP och HTTPS | Sättet webben pratar på. HTTPS är krypterat, HTTP är det inte. Vår tjänst kör än så länge HTTP. |
| Token (åtkomsttoken) | Ett lösenord som appen skickar med varje förfrågan så att servern vet att det är du. |
| API-nyckel | En hemlig kod från Anthropic som gör att servern får använda AI:n och som debiteras dig. |
| Angular | Ramverket vi byggde appen med. |
| Verktygsanrop (tool call) | Ett sätt att tvinga AI:n att svara med strukturerad data (fält) i stället för fri text. |
| Gränsvärde | Ett min- och maxvärde per sensor, till exempel vatten 18 till 24 grader. |
| Hysteres | En liten marginal som hindrar att en varning blinkar av och på när ett värde ligger precis vid gränsen. |
| Plausibelt intervall | Det som är fysiskt rimligt för en sensor (till exempel vatten 0 till 50 grader). Skiljer sig från gränsvärdena som är växtens önskemål. |
| Git och repo | Git är ett program som sparar alla versioner av dina filer. Ett repo (repository) är en projektmapp med hela historiken, här på GitHub. |

## 3. Helhetsbilden

Så här hänger allt ihop. Pilarna visar åt vilket håll informationen går. Rutan i mitten är Node-RED, som innehåller tre flikar: två som fanns förut och en ny.

![Figur 1: Helhetsbilden, från sensor till app](fig-overview)

### Vad som fanns förut och vad som är nytt

| Fanns förut (teamets del) | Nytt (LeafLimits) |
|---|---|
| Firmware på ESP32 | Appen (Angular) |
| Mosquitto (MQTT-broker) | Node-RED-fliken LeafLimits |
| Fliken MQTT Validation | AI-förslag från foto |
| Fliken InfluxDB storage | Skript för säker inläggning på servern |
| InfluxDB och Grafana | Tester, demo-körare, portabel installation (Docker compose) |

### Var det körs

| Vad | Var | Port |
|---|---|---|
| Mosquitto (MQTT) | Hetzner-servern 95.216.208.235 | 1884 |
| Node-RED (och appen) | samma server | 1881 |
| InfluxDB | samma server | 8087 |
| Grafana | samma server | 3002 |

Servern är en liten ARM-dator (2 processorkärnor, 4 GB minne) med Ubuntu 24.04. Den kör även ett äldre projekt (pm-iot) på andra portar. Det rör vi inte.

> **Varför är LeafLimits en extra flik och inte en ny server?** För att det gamla systemet redan fungerar och används i demon. En ny flik som bara läser de färdiga mätvärdena kan inte förstöra något, och man kan stänga av den med ett klick. Mer om det i kapitel 11.

## 4. Del 1: Från sensor till server

### 4.1 ESP32 och sensorerna

ESP32-S3 sitter i växtlådan och har tre sensorer kopplade:

| Sensor | Typ | Mäter | Blir till mätvärdet |
|---|---|---|---|
| SHT31 | I2C | Temperatur och luftfuktighet inne i lådan | internal_temperature och internal_humidity |
| DS18B20 (vattenprobe) | 1-Wire | Vattentemperatur | water_temperature |
| DS18B20 (luftprobe) | 1-Wire | Lufttemperatur utanför lådan | external_temperature |

Det blir alltså fyra mätvärden från tre fysiska sensorer.

### 4.2 Problemet med de två likadana sensorerna

De två DS18B20 sitter på **samma ledning**. För att datorn ska kunna skilja dem åt har varje sensor ett eget, unikt nummer (ROM-adressen). Firmware måste veta vilket nummer som är vattenproben och vilket som är luftproben.

Just nu är det **inte inställt**: firmware hittar sensorerna i den ordning de svarar, och den ordningen kan byta plats. Då skulle "vattentemperaturen" i själva verket vara lufttemperaturen och tvärtom. Det är extra viktigt för LeafLimits, eftersom vattnets gränser då skulle gälla fel sensor.

> **Att göra (uppgift för PC-sessionen):** ta reda på vilket ROM-nummer som är vatten och vilket som är luft (doppa en probe i varmt vatten och se vilket värde som stiger), skriv in dem i inställningarna CONFIG_DS18B20_WATER_ROM och CONFIG_DS18B20_EXTERNAL_ROM och flasha om datorn. Två kandidater hittades tidigare: BE0000006DEFD428 och DA00000070118128, men vilken som är vilken är inte bekräftat.

![Figur 2: Så är sensorerna kopplade, och frågan om vilken probe som är vatten och vilken som är luft](fig-sensors)

### 4.3 MQTT: postkontoret

Datorn skickar inte data direkt till en databas. Den lägger meddelanden i en **brevlåda** hos en **MQTT-broker** (Mosquitto). Andra program som vill ha datan **prenumererar** på brevlådan och får varje nytt meddelande. Fördelen är att avsändaren och mottagarna inte behöver känna till varandra. Vi kan lägga till nya mottagare (som LeafLimits) utan att ändra något hos ESP32.

Brevlådornas namn (topics) ser ut som sökvägar:

| Topic | Vem lägger dit | Vad det är |
|---|---|---|
| microhydros/v1/devices/esp32s3-01/telemetry/raw | ESP32 | Alla fyra mätvärdena i ett meddelande, råa och okontrollerade |
| microhydros/v1/devices/esp32s3-01/telemetry/validated/water_temperature | Node-RED | Ett godkänt mätvärde (finns en per sensor) |
| microhydros/v1/devices/esp32s3-01/telemetry/rejected | Node-RED | Ett underkänt mätvärde, med orsak |
| microhydros/v1/devices/esp32s3-01/limits/config | Node-RED (LeafLimits) | Växtens gränsvärden, sparade som retained-meddelande |
| microhydros/v1/devices/esp32s3-01/limits/alert | Node-RED (LeafLimits) | Larm när ett tillstånd ändras |

Delen esp32s3-01 är enhetens namn. Om man får fler enheter byter de bara namn i topicen.

Figuren visar vem som lägger brev i vilken brevlåda och vem som hämtar dem. Notera att LeafLimits både hämtar (validated och config) och lägger (config och alert).

![Figur 3: Brevlådorna i Mosquitto, vem som lägger brev och vem som hämtar dem](fig-pubsub)

### 4.4 Meddelandet: JSON

Varje meddelande från ESP32 är en liten textbit i JSON-format:

```
{
  "schema_version": 1,
  "device_id": "esp32s3-01",
  "boot_id": "a1b2c3",
  "sequence": 1042,
  "uptime_ms": 5210000,
  "measurements": {
    "internal_temperature_c": 24.5,
    "internal_humidity_percent": 58.0,
    "external_temperature_c": 24.6,
    "water_temperature_c": 23.9
  },
  "sensor_status": {
    "internal_sht31": "ok",
    "external_ds18b20": "ok",
    "water_ds18b20": "ok"
  }
}
```

| Fält | Betydelse |
|---|---|
| schema_version | Vilken version av meddelandeformatet det är. Gör att man kan ändra formatet i framtiden. |
| device_id | Vilken enhet som skickade. Måste stämma med namnet i topicen. |
| boot_id | Ett nummer som byts varje gång datorn startar om. |
| sequence | Räknare som ökar med ett för varje meddelande. Används för att upptäcka dubbletter. |
| uptime_ms | Hur länge datorn har varit igång, i millisekunder. |
| measurements | De fyra mätvärdena. |
| sensor_status | Om varje sensor fungerar: ok, read_error (läsfel), not_detected (hittas inte) eller invalid_value. |

> **Varför skickas det var 5:e sekund?** Det bestämdes för klassdemon: då ser man tydligt att datan är levande. Tidigare var det var 30:e sekund. För en växt räcker det gott med mer sällan. Intervallet är en inställning i firmware.

## 5. Del 2: Kontrollen av mätvärdena (validering)

Innan något sparas kontrollerar Node-RED-fliken **MQTT Validation** varje meddelande. Den är teamets kod och vi har inte ändrat den.

### 5.1 Vad som kontrolleras

**Först hela meddelandet:** Är det giltig JSON? Stämmer device_id med topicen? Är schema_version 1? Finns boot_id, sequence och uptime_ms? Finns mätvärden och sensorstatus? Är det en dubblett (samma enhet, samma boot_id och samma sequence som förut)?

**Sedan varje mätvärde för sig:** Finns värdet? Har sensorn status ok? Är värdet ett riktigt tal (inte tomt)? Ligger det inom det **plausibla intervallet**?

| Mätvärde | Plausibelt intervall |
|---|---|
| internal_temperature | -10 till 60 grader |
| internal_humidity | 0 till 100 procent |
| external_temperature | -40 till 60 grader |
| water_temperature | 0 till 50 grader |

Ett värde som klarar allt publiceras på sin egen brevlåda under **validated**. Ett som inte klarar det hamnar under **rejected** tillsammans med en orsakskod, till exempel sensor_read_error eller out_of_plausible_range. Eftersom varje mätvärde kontrolleras för sig kan en trasig sensor inte stoppa de andra tre. Flödesschemat visar beslutsvägen för ett meddelande.

![Figur 4: Så kontrolleras ett meddelande i fliken MQTT Validation](fig-validation)

### 5.2 Validering är inte samma sak som gränsvärden

> **Det här är den viktigaste skillnaden i hela projektet.**
> Validering svarar på frågan **"kan det här värdet vara sant?"** (Kan vatten vara 99 grader? Nej, sensorn är trasig, kasta värdet.)
> LeafLimits svarar på frågan **"är det här bra för växten?"** (Vatten på 26 grader är möjligt men för varmt för en fikonbuske, spara värdet och varna.)

Därför bygger LeafLimits **ovanpå** valideringen. Det läser bara de redan godkända värdena. Ett för varmt vatten får aldrig kastas bort, för det är ett riktigt mätvärde som du vill ha i grafen.

## 6. Del 3: Lagring och grafer

### 6.1 InfluxDB

Fliken **InfluxDB storage** prenumererar på de godkända mätvärdena och skriver varje värde till databasen InfluxDB. Så här ser en post ut:

| Del | Innehåll | Exempel |
|---|---|---|
| Measurement (tabellnamn) | Alltid sensor_reading | sensor_reading |
| Tags (etiketter man kan söka på) | device_id, measurement_type, sensor_id, unit | esp32s3-01, water_temperature, water_ds18b20, celsius |
| Fält value | Själva mätvärdet (decimaltal) | 23.9 |
| Övriga fält | schema_version, sequence, uptime_ms (heltal) och boot_id (text) | 1042 |
| Tidsstämpel | Sätts av Node-RED när värdet godkänns (UTC-tid) | 2026-09-20T08:11:02Z |

Allt ligger i bucket **microhydros** i organisationen microhydros.

### 6.2 Grafana

Grafana läser från InfluxDB och visar instrumentpanelen **MicroHydros measurements**: fyra stora "nuvärden" och fyra historiegrafer (medelvärden över tid). Panelen och kopplingen till databasen laddas in automatiskt från filer, så man behöver inte klicka ihop dem.

> **Bra att veta:** panelens automatiska uppdatering är avstängd. "Nuvärdena" visar det som fanns när sidan senast laddades. Välj 5s eller 10s uppe till höger i Grafana, eller tryck Refresh. Appen uppdaterar sig själv var 5:e sekund.

### 6.3 Ett verkligt exempel: felet i Data Explorer

När databasen skulle kontrolleras visade InfluxDB:s Data Explorer felet **"unsupported input type for mean aggregate: string"** och inga data. Databasen var full av data. Frågebyggaren hade kryssat i **alla** fält, också boot_id som är text, och försökte räkna medelvärde av text. Det går inte.

**Lösning:** kryssa bara i fältet **value**, eller skriv frågan så här i Script Editor:

```
from(bucket: "microhydros")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "sensor_reading" and r._field == "value")
  |> filter(fn: (r) => r.device_id == "esp32s3-01")
  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
```

## 7. Del 4: Kärnan i LeafLimits, gränsvärden och larm

### 7.1 Gränsvärdena

För varje sensor kan du ange ett min och ett max. Så här ser en sparad profil ut:

```
{
  "device_id": "esp32s3-01",
  "plant": "Fig (Ficus carica)",
  "source": "ai",
  "updated_at": "2026-09-20T07:36:48Z",
  "limits": {
    "water_temperature":    { "min": 18, "max": 24 },
    "internal_temperature": { "min": 18, "max": 30 },
    "internal_humidity":    { "min": 40, "max": 60 },
    "external_temperature": { "min": 10, "max": 35 }
  }
}
```

Fältet source säger om gränserna kom från AI:n (ai) eller skrevs in för hand (manual). En sensor utan gräns markeras som "Ingen gräns satt" och ger aldrig larm.

Gränserna får inte ligga utanför sensorns **plausibla intervall** (kapitel 5), och min måste vara lägre än max. Det kontrolleras både i appen och på servern.

### 7.2 De fyra tillstånden

| Tillstånd | Betyder | Visas i appen som |
|---|---|---|
| ok | Värdet ligger inom gränserna | I intervall (grön) |
| low | Värdet är för lågt | För låg (röd) |
| high | Värdet är för högt | För hög (röd) |
| unknown | Ingen gräns är satt, eller inget värde har bedömts än | Ingen gräns satt, eller Väntar på mätvärde |

Figuren visar hur ett tillstånd byter till ett annat och vad som krävs för det.

![Figur 5: Tillståndsdiagram för varje sensor](fig-states)

### 7.3 Reglerna: när blir det larm?

Man skulle kunna larma så fort ett enda värde ligger fel. Men sensorer brusar: ett enstaka konstigt värde är ofta inget problem. Därför gäller tre regler:

1. **Tre mätvärden i rad** utanför gränsen krävs för att larmet ska gå (3 x 5 sekunder = 15 sekunder).
2. **Två mätvärden i rad** inom gränsen krävs för att larmet ska släppa.
3. **Hysteres på 2 procent:** för att räknas som "tillbaka i intervallet" måste värdet vara en liten bit innanför gränsen. Marginalen är 2 procent av intervallets bredd.

> **Varför?** Utan reglerna skulle ett värde som studsar mellan 23,9 och 24,1 grader (gränsen är 24) få larmet att blinka av och på hela tiden. Regel 1 och 2 tar bort enstaka avvikare. Regel 3 tar bort blinkandet vid gränsen.

**Räkneexempel.** Gräns för vatten: 18 till 24. Marginalen är (24 - 18) x 0,02 = 0,12 grader, så värdet måste vara 23,88 eller lägre för att räknas som tillbaka.

| Nr | Vattenvärde | Vad händer | Tillstånd efter |
|---|---|---|---|
| 1 | 21,0 | Inom gränsen | ok |
| 2 | 24,5 | Över gränsen, 1 i rad | ok (räknar) |
| 3 | 24,6 | Över gränsen, 2 i rad | ok (räknar) |
| 4 | 24,7 | Över gränsen, 3 i rad. **Larm skickas.** | high |
| 5 | 24,0 | Inte över 24, men inom marginalen (över 23,88). Räknas fortfarande som för högt. | high |
| 6 | 23,5 | Tillbaka innanför marginalen, 1 i rad | high (räknar) |
| 7 | 23,4 | Tillbaka, 2 i rad. **Larm släpps.** | ok |

Om värdena i stället vore 25, 25, 20, 25, 25 skulle inget larm gå, eftersom serien bryts av ett värde inom gränsen.

Samma exempel som diagram. Rödprickig linje är max, den orangea prickade är marginalen.

![Figur 6: Räkneexemplet som diagram, med larm och marginal](fig-chart)

När du sparar nya gränser **börjar bedömningen om från noll**. De senaste värdena behålls, men tillståndet blir unknown tills nya mätvärden har bedömts. Det är därför appen kan visa "Väntar på mätvärde" i några sekunder efter att du sparat.

### 7.4 Larmmeddelandet

Ett larm skickas **bara när tillståndet ändras** till eller från low eller high, inte varje gång ett värde är fel. Det läggs i brevlådan .../limits/alert:

```
{
  "schema_version": 1,
  "device_id": "esp32s3-01",
  "measurement": "water_temperature",
  "state": "high",
  "previous_state": "ok",
  "value": 24.7,
  "unit": "celsius",
  "limit": { "min": 18, "max": 24 },
  "timestamp": "2026-09-20T08:14:12Z"
}
```

Idag lyssnar ingen på larmen, men de finns där för framtiden. Till exempel kan en pip, en notis eller ett mejl kopplas på utan att ändra något i LeafLimits.

### 7.5 Hur gränserna sparas: retained-meddelande

Var ska gränserna ligga så att de överlever att Node-RED startar om? Vi valde att spara dem som ett **retained MQTT-meddelande**: ett meddelande som postkontoret (Mosquitto) själv kommer ihåg och delar ut till alla som börjar prenumerera.

1. När du sparar gränser i appen lägger Node-RED ett retained-meddelande i brevlådan .../limits/config.
2. Node-RED prenumererar på samma brevlåda och får därför alltid tillbaka sina egna gränser, även efter en omstart.
3. Vill man ta bort en profil skickar man ett tomt retained-meddelande.

![Figur 7: Så överlever gränserna att Node-RED startar om](fig-retained)

> **Varför retained i stället för en fil eller databas?** Det krävde ingen ändring av serverns inställningar eller något nytt program. Mosquitto sparar meddelandena i sin egen lagring. Det gjorde att LeafLimits kunde läggas in utan att röra något som redan fungerade. Det bevisades i ett test: Node-RED startades om och gränserna kom tillbaka av sig själva.

### 7.6 API:et: appens beställningsfönster

Appen pratar med Node-RED över HTTP. Alla adresser börjar med /leaflimits/ och alla utom appfilerna kräver att du skickar med din **token** i ett huvud: Authorization: Bearer din-token.

| Anrop | Vad det gör |
|---|---|
| GET /leaflimits/api/limits/esp32s3-01 | Hämtar sparade gränser (eller en tom profil om inget är sparat) |
| PUT /leaflimits/api/limits/esp32s3-01 | Kontrollerar och sparar nya gränser |
| GET /leaflimits/api/status/esp32s3-01 | Hämtar senaste värde och tillstånd för varje sensor |
| POST /leaflimits/api/suggest | Skickar ett foto och får tillbaka ett AI-förslag. Sparar ingenting. |
| GET /leaflimits/ | Själva appen (filerna), ingen token behövs |

Svarskoderna som servern kan ge:

| Kod | Betydelse | Vanlig orsak |
|---|---|---|
| 200 | Det gick bra | |
| 400 | Något är fel i det du skickade | min är större än max, värde utanför tillåtet intervall, ogiltigt foto |
| 401 | Fel eller saknad token | Du har skrivit fel token i inställningarna |
| 404 | Adressen finns inte | Fliken LeafLimits är avstängd i Node-RED |
| 429 | För många AI-förfrågningar | Mer än 20 per timme |
| 502 | AI-tjänsten avvisade förfrågan | Ogiltig nyckel, slut på kredit, modell saknas |
| 503 | Inte konfigurerat eller upptaget | Ingen AI-nyckel satt, eller AI-tjänsten är överbelastad |

### 7.7 Vad som finns inuti fliken

Fliken LeafLimits har fyra avsnitt (38 noder):

| Avsnitt | Vad det gör |
|---|---|
| 1. Utvärdera mätvärden | Prenumererar på validated-värdena, jämför med gränserna, uppdaterar tillståndet och skickar larm |
| 2. Lagring av gränser | Prenumererar på limits/config och lägger profilen i minnet |
| 3. HTTP-API | De fyra API-anropen. Varje anrop börjar med en tokenkontroll. |
| 4. Appfilerna | Skickar de färdigbyggda appfilerna till webbläsaren |

**Hur fliken byggs:** koden för varje nod skrivs som vanliga .js-filer i mappen docker/node-red/leaflimits/src. Ett byggskript (build.js) sätter ihop dem till den importfil som Node-RED läser (flows/leaflimits.json). Testerna kör exakt samma kod som hamnar i fliken, så det som testas är det som körs.

## 8. Del 5: AI-förslaget från ett foto

### 8.1 Steg för steg

1. Du väljer ett foto i appen (kameran eller galleriet).
2. Appen kontrollerar filen och **krymper** den till en JPEG på högst 1024 pixlar på längsta sidan. Då blir uppladdningen liten (ungefär 100 till 300 kB) och snabb.
3. Fotot skickas till POST /leaflimits/api/suggest.
4. Node-RED kontrollerar din token, att en AI-nyckel finns, att fotot ser rimligt ut och att du inte har passerat 20 förfrågningar den senaste timmen.
5. Node-RED skickar fotot och en instruktion till Claude.
6. Claude svarar genom att fylla i ett **verktygsanrop** med fasta fält.
7. Node-RED **rensar** svaret: allt kontrolleras mot sensorernas plausibla intervall och ogiltiga gränser slängs.
8. Appen visar svaret på sidan Granska, där du ändrar och sparar (eller avbryter).

![Figur 8: Från foto till förslag, uppdelat på vem som gör vad](fig-ai)

### 8.2 Instruktionen till AI:n (prompten)

Instruktionen ligger i filen docker/node-red/leaflimits/src/suggest-prepare.fn.js. Den är skriven på engelska. I korthet säger den:

- Du hjälper en hobbyodlare att sätta gränser för ett litet hydroponiskt system.
- Du får ett foto på en växt. Identifiera växten så gott det går.
- Föreslå trivsamma intervall för sensorerna. Temperatur i grader Celsius, luftfuktighet i procent.
- Håll dig inom det tillåtna intervallet för varje sensor.
- Intervallet ska vara det växten mår **bra** i, inte vad den överlever.
- Ta bara med utomhustemperaturen om den spelar roll för växten.
- Om fotot inte visar en växt, eller du inte kan avgöra vilken det är: sätt confidence till 0, lämna gränserna tomma och förklara i anteckningarna.
- Var ärlig med confidence (0 till 1). Håll anteckningarna under 300 tecken. Svara bara genom verktygsanropet.

> **Varför ett verktygsanrop?** Utan det kan AI:n svara med en fritext som "Det ser ut som en fikonbuske! Jag skulle föreslå ungefär...". Det är svårt för ett program att läsa. Med ett verktygsanrop **tvingas** AI:n fylla i fält: växtens namn, hur säker den är, anteckningar och gränser. Då får programmet alltid data i samma form.

Ett svar kan se ut så här:

```
{
  "plant": "Fig (Ficus carica)",
  "confidence": 0.9,
  "notes": "Fikon trivs varmt och ljust.",
  "limits": {
    "water_temperature": { "min": 18, "max": 24 },
    "internal_humidity": { "min": 40, "max": 60 }
  }
}
```

### 8.3 Vi litar aldrig blint på AI:n

- Alla gränser kontrolleras mot sensorns plausibla intervall och klipps eller slängs om de är fel.
- Sparningen kräver alltid att du trycker på Spara. AI:n kan aldrig ändra något själv.
- **Verkligt test:** en tom grå bild (ingen växt) gav confidence 0 och inga gränser, med en vänlig förklaring. Det är exakt vad instruktionen ber om.
- Konfidensen visas i appen så att du ser hur säker AI:n är.

### 8.4 Vad AI:n inte kan

Den ser bara ett foto. Den vet inte hur gammal växten är, hur ditt system är byggt eller vilka temperaturer just din sort verkligen klarar. Den kan också ta fel på växten. Se förslaget som en **bra första gissning**, inte som en sanning.

### 8.5 Kostnad och skydd

Varje förslag är en betald förfrågan till Anthropic. Priset per foto är normalt en bråkdel av en US-cent upp till några cent, beroende på modell och bildstorlek. Exakt pris står i Anthropics prislista. För att skydda plånboken finns en spärr på **20 förfrågningar per timme** för hela servern, och man kan sätta en månadsgräns hos Anthropic.

### 8.6 Felmeddelanden från AI-delen

| Appen säger | Betyder | Åtgärd |
|---|---|---|
| The AI key on the server was rejected | Anthropic accepterar inte nyckeln (raderad, utgången eller fel) | Skapa ny nyckel och sätt den på fliken (kapitel 14) |
| The AI account has no credit left | Kontot hos Anthropic har slut på kredit | Fyll på under Plans och Billing i Anthropics Console |
| The AI model is not available | Modellen finns inte för nyckeln | Byt modellnamn i flikens variabel ANTHROPIC_MODEL |
| The AI service is busy | Tillfälligt överbelastat eller för många förfrågningar | Vänta en minut |
| AI suggestions are not configured | Ingen nyckel är satt på servern | Sätt nyckeln (kapitel 14) |
| Too many AI requests this hour | Du har passerat 20 i timmen | Vänta, eller skriv gränserna för hand |

## 9. Del 6: Appen

Appen är en webbapp byggd med **Angular 21**. Du öppnar den i webbläsaren på adressen http://95.216.208.235:1881/leaflimits/. Det finns fyra skärmar, och menyn ligger längst ned.

### 9.1 De fyra skärmarna

| Skärm | Vad du ser och gör |
|---|---|
| Aktuellt | Vilken växt som är vald, när gränserna sparades, och för varje sensor: senaste värde, gränsen och en färgad markering (I intervall, För låg, För hög). Uppdateras var 5:e sekund. Härifrån går du till Ta foto eller Redigera för hand. |
| Foto | Knappen Ta ett foto öppnar kameran. Knappen Välj från galleriet öppnar filväljaren. På en dator kan du också dra och släppa en bild. Sedan visas en förhandsvisning och knappen Hämta föreslagna gränser. |
| Granska | Fälten för växtens namn och min och max för varje sensor. Har AI:n gett ett förslag är de förifyllda och du ser dess konfidens och anteckningar. Felmeddelande visas om min inte är lägre än max eller om värdet ligger utanför det tillåtna. Sparar gör du med Spara gränser. |
| Inställningar | Din åtkomsttoken och enhetens namn. Sparas bara i din webbläsare. |

![Figur 9: De fyra skärmarna i appen (appens text är engelsk)](fig-screens)

**Appens text är på engelska.** Här är översättningen av det du ser:

| I appen | På svenska |
|---|---|
| Current | Aktuellt |
| Photo | Foto |
| Review | Granska |
| Settings | Inställningar |
| Take a photo | Ta ett foto |
| Choose from gallery | Välj från galleriet |
| Edit by hand | Redigera för hand |
| Get suggested limits | Hämta föreslagna gränser |
| Save limits | Spara gränser |
| In range | I intervall |
| Too low | För låg |
| Too high | För hög |
| No limit set | Ingen gräns satt |
| Waiting for a reading | Väntar på mätvärde |

### 9.2 Fotot: kamera, galleri och kontroller

- **Ta ett foto** öppnar kameran direkt på telefonen. **Välj från galleriet** använder den vanliga filväljaren, så du kan ta ett foto du redan har.
- Filen kontrolleras: den måste vara en bild, får inte vara tom, inte större än 25 MB, och SVG-ritningar avvisas.
- **HEIC-foton** (vanliga på iPhone) kan vissa webbläsare inte öppna. Då får du ett tydligt meddelande om att välja JPEG eller PNG.
- Bilden krymps i mobilen till högst 1024 pixlar. Under förhandsvisningen står hur stor den blir, till exempel "sent as about 200 KB".

### 9.3 Vad som händer under huven

- Appen är **statiska filer** (HTML, JavaScript och CSS, totalt cirka 350 kB) som Node-RED skickar ut. Det behövs alltså ingen egen webbserver.
- Appen använder **relativa adresser** för API-anropen. Därför fungerar den oavsett vilken server eller sökväg den ligger på.
- Sidbyten sker med "hash-routing" (adresser som slutar på #/settings). Då behöver servern inte veta något om appens sidor.
- Din token sparas i webbläsarens lokala lagring och skickas med varje anrop.
- **Demoläge:** öppnar du appen med ?mock=1 i adressen använder den påhittad data utan server. Det är bra för att prova utan att röra något (?mock=0 stänger av det).

### 9.4 Skydd i appen

Fältet i inställningarna är till för LeafLimits-token. Någon klistrade en gång in AI-nyckeln där, vilket inte får hända. Därför:

- Ett värde som ser ut som en API-nyckel (börjar med sk-) **nekas** med en förklaring.
- Om en nyckel av misstag redan ligger sparad i webbläsaren **tas den bort automatiskt** när appen laddas.
- Appen skickar aldrig något som ser ut som en nyckel.

## 10. Del 7: Lösenord, nycklar och säkerhet

Det finns flera hemligheter i projektet. Det är viktigt att inte blanda ihop dem. Figuren visar vilken hemlighet som finns var, och vad som aldrig får hamna i appen.

![Figur 10: Vilken hemlighet som finns var](fig-secrets)

| Hemlighet | Vad den gör | Var den finns | Skrivs in i appen? |
|---|---|---|---|
| LeafLimits åtkomsttoken (48 tecken) | Låter appen prata med API:et | Satt som krypterad variabel på fliken i Node-RED. En kopia i filen .leaflimits_token i ws-mappen. | **Ja**, i Inställningar |
| Anthropic API-nyckel (sk-ant-...) | Låter servern använda AI:n och debiteras dig | Krypterad variabel på fliken. Kopia i filen .anthropic_key i ws-mappen. | **Aldrig** |
| Node-RED-redigerarens lösenord | Logga in i Node-RED på port 1881 | I din lösenordshanterare. Ska bytas efter att det delats i en chatt. | Nej |
| Serverns SSH-lösenord | Logga in på servern | Anteckningar/lösenordshanterare | Nej |

### 10.1 Så skyddas hemligheterna

- Token och AI-nyckel sparas i Node-RED som **krypterade uppgifter**. De står **inte** i flödesfilen, så de följer inte med om någon exporterar fliken.
- Filerna med hemligheter ligger **utanför** git-mappen, och git är dessutom inställt att ignorera filer som .anthropic_key, .leaflimits_token, .nodered_password och allt som slutar på _key, _token eller _password.
- Innan något laddas upp till GitHub körs en genomsökning som letar efter nycklar och lösenord i all historik.
- Skripten skriver aldrig ut en nyckel, och nyckeln skickas aldrig som argument på kommandoraden.

### 10.2 Om API-nyckelns livslängd

En nyckel skapas i Anthropics Console och får då en **utgångstid**: 3 timmar, 1 dag, 7 dagar, 30 dagar, en egen längd eller aldrig. **Utgångstiden går inte att ändra eller förlänga efteråt.** När nyckeln har gått ut svarar Anthropic att "API key is invalid", vilket ser likadant ut som en raderad nyckel. Då måste man skapa en ny nyckel.

Det hände också här: den första nyckeln gällde bara ett par timmar. Nuvarande nyckel gäller 30 dagar, alltså till omkring **20 oktober 2026**. Anthropic mejlar sju dagar innan. För en server som ska köra länge bör man skapa en nyckel utan utgångstid (om organisationen tillåter det).

### 10.3 Ett svagt ställe: HTTP

Appen och API:et går över **HTTP**, som inte är krypterat. Det betyder att din token skickas i klartext. Använd den därför bara på nät du litar på. Nästa steg för att lösa det är att sätta HTTPS framför (en så kallad reverse proxy med certifikat).

## 11. Del 8: Så lades det in på den riktiga servern, säkert

Servern kör teamets fungerande system och används i demon. Därför gällde en enda regel: **rör inget som fungerar, och gör allt ångerbart.**

### 11.1 Principen: bara addera

LeafLimits lades in som en **ny flik** i den befintliga Node-RED. Fliken läser bara de redan godkända mätvärdena. Teamets egna flikar ändrades aldrig och stängdes aldrig av. Fliken lades in **avstängd**, konfigurerades och slogs sedan på. Vill man tillbaka stänger man av den med ett kommando.

### 11.2 Stegen som togs

1. **Säkerhetskopia** av serverns flöden (flows.json, flows_cred.json och krypteringsnyckeln), sparad på mobilen utanför git-mappen.
2. **Repetition på en kopia:** hela inläggningen kördes först mot en lokal kopia av de riktiga flödena. Där bevisades att inga befintliga noder ändras, att MQTT-anslutningen aldrig bryts och att återställning ger exakt den ursprungliga versionen.
3. **Appfilerna kopierades** in i Node-REDs egen datamapp (/data/leaflimits-app).
4. **Fliken importerades avstängd** med skriptet live-import.js.
5. **Token och AI-nyckel sattes** som krypterade uppgifter, från filer och utan att skrivas ut.
6. **Fliken slogs på.** Skriptet provade API:et: rätt token ger 200, fel token ger 401.
7. **Teamets lagringsflik slogs på igen.** Den hade av misstag varit avstängd sedan 18 september, så inget hade sparats.
8. **Slut-till-slut-test på riktigt:** ett tydligt märkt testmätvärde (enhet leaflimits-test) skickades genom systemet. Det godkändes, sparades i InfluxDB och bedömdes av LeafLimits. Sedan raderades exakt de fyra testpunkterna.
9. **En riktig AI-förfrågan från servern** gjordes och lyckades.

![Figur 11: De steg som togs för att lägga in LeafLimits säkert](fig-deploy)

### 11.3 Vad som bevisades efteråt

| Kontroll | Resultat |
|---|---|
| Befintliga noder efter inläggningen | Alla 15 identiska, byte för byte, med säkerhetskopian |
| Node-RED-containern | Startades inte om (samma starttid som förut, 0 omstarter) |
| MQTT-anslutningen | Bröts aldrig. Brokern såg bara mina egna korta testklienter. |
| Övriga containrar på servern | Alla 10 körde hela tiden |
| Flödesfilen | Innehåller inga hemligheter |
| Inloggningsfilen med lösenordet | Raderades efteråt |

### 11.4 Skriptet live-import.js

Skriptet pratar med Node-REDs administrations-API och gör samma sak som knapparna Import och Deploy, men med kontroller. Det vägrar köra om något är fel, använder versionsnumret på flödena så att det aldrig skriver över en ändring någon annan gjort, och bevisar efteråt att inget utanför LeafLimits ändrats.

| Läge | Vad det gör |
|---|---|
| --status | Läser bara och visar om fliken finns och är på |
| (inget läge) | Importerar fliken avstängd |
| --configure | Sätter token och AI-nyckel från filer |
| --enable | Slår på fliken och provar API:et |
| --disable | Stänger av fliken igen, allt är som förut |
| --remove | Tar bort fliken helt (full återställning) |
| --enable-storage och --disable-storage | Slår på eller av teamets lagringsflik. Bara den flaggan ändras. |
| --dry-run | Gör alla kontroller men ändrar ingenting |

> **Varför ett skript i stället för att klicka i Node-RED?** Klick går att göra fel och lämnar inga bevis. Skriptet gör samma sak varje gång, kontrollerar allt innan och efter, och kan provas i förväg på en kopia. Det är därför inläggningen kunde göras utan att något gick sönder.

## 12. Del 9: Så vet vi att det fungerar (tester)

| Vad | Antal | Vad det bevisar | Hur du kör det |
|---|---|---|---|
| Enhetstester för Node-RED-fliken | 54 | Varje funktion ger rätt svar, även vid konstiga eller elaka indata (till exempel farliga enhetsnamn, fel token, trasiga AI-svar) | node --test docker/node-red/leaflimits/test/unit.test.js |
| Integrationstester | 13 | Hela fliken fungerar i en riktig Node-RED 5.0.7 med en riktig MQTT-broker och en låtsas-AI: åtkomst, spara och läsa gränser, larm, omstart, AI-fel, appfiler | node --test .../test/integration.test.js (kräver ett par paket) |
| Enhetstester för appen | 27 | Kontroller av gränser, tillstånd, bildkrympning, filkontroller och nyckelskyddet | npx ng test i app-mappen |
| Repetition av inläggningen | flera körningar | Att inläggning, konfigurering, påslagning och återställning inte rör något befintligt | Gjordes på en kopia av de riktiga flödena |
| Riktiga tester på servern | flera | Att allt fungerar på riktigt, inklusive AI från servern | Se kapitel 11 |

### 12.1 Demo-köraren

Vill du prova allt utan att röra den riktiga servern finns en **demo-körare**. Den startar på mobilen:

- en egen liten MQTT-broker (ingen koppling till någon riktig server),
- Node-RED med teamets valideringsflik och LeafLimits-fliken,
- appen på http://localhost:1880/leaflimits/ (token: demo),
- en **låtsasenhet** som skickar ett mätvärde var 5:e sekund, där vattentemperaturen pendlar mellan cirka 17 och 27 grader så att larm utlöses,
- den **riktiga AI:n** om nyckelfilen finns, annars ett låtsassvar.

Start och stopp görs med skripten start-demo.sh och stop-demo.sh i mappen docker/node-red/leaflimits/dev.

## 13. Del 10: Var finns allt? (mappar och filer)

Allt ligger i ditt privata repo **BasitMN/leaflimits-ai** på GitHub.

| Sökväg | Innehåll |
|---|---|
| app/ | Angular-appen (källkod, tester, byggkonfiguration) |
| docker/node-red/leaflimits/src/ | Koden för varje nod i LeafLimits-fliken (vanliga .js-filer) |
| docker/node-red/leaflimits/build.js | Sätter ihop koden till importfilen |
| docker/node-red/flows/leaflimits.json | Den färdiga importfilen för Node-RED |
| docker/node-red/leaflimits/test/ | Enhetstester och integrationstester |
| docker/node-red/leaflimits/dev/ | Hjälpskript: demo-körare, live-import, nyckelkontroll, spara nyckel och lösenord |
| docker/node-red/flows/ | Teamets flikar (validering och lagring) och LeafLimits |
| docker/grafana/ | Grafana-panelen och kopplingen till databasen |
| compose.yaml och scripts/ | Portabel installation av hela servern (skriven, men inte körd på Docker än) |
| firmware/esp32s3/ | ESP32-programmet (teamets, kopia) |
| docs/ | Planer och dokument, bland annat PLAN.md och det här dokumentet |

### Grenarna (branches) i repot

| Gren | Innehåll |
|---|---|
| main | En exakt kopia av teamets gren feature/esp32s3-firmware (PR #16) |
| deploy | Arbetet med den portabla installationen |
| app | Allt: appen, Node-RED-fliken, tester, skript och dokument (den nyaste) |

Teamets riktiga repo är Samuel2Nugor/MicroHydros. Det är ett annat repo än ditt eget, och inget från LeafLimits har lagts där.

## 14. Del 11: Praktiska guider steg för steg

### A. Använda appen (riktiga servern)

1. Öppna http://95.216.208.235:1881/leaflimits/ i webbläsaren.
2. Tryck **Inställningar** (längst ned), skriv in din åtkomsttoken (**inte** AI-nyckeln) och tryck Spara.
3. Tryck **Foto**, välj eller ta ett foto på växten och tryck **Hämta föreslagna gränser**.
4. På **Granska**: kontrollera växtens namn och gränserna, ändra om du vill och tryck **Spara gränser**.
5. Gå till **Aktuellt**. Efter några sekunder visas för varje sensor om den är i intervall eller inte.

### B. Prova demon på mobilen

1. Kör bash docker/node-red/leaflimits/dev/setup-demo.sh en gång (tar några minuter).
2. Kör bash docker/node-red/leaflimits/dev/start-demo.sh.
3. Öppna http://localhost:1880/leaflimits/ och skriv token **demo** i Inställningar.
4. När du är klar: bash docker/node-red/leaflimits/dev/stop-demo.sh.

### C. Byta eller skapa API-nyckel

1. Skapa en ny nyckel i Anthropics Console (Settings, API keys). Välj utgångstid, gärna "Never" om det går, och se till att kontot har kredit.
2. Spara den: bash docker/node-red/leaflimits/dev/save-key.sh. Skriv nyckeln när den frågar (den syns inte).
3. Kontrollera den: bash docker/node-red/leaflimits/dev/check-key.sh. Skriptet säger med vanliga ord om nyckeln godkänns, om det finns kredit och om modellen finns.
4. För demon: starta om den. För riktiga servern: kör live-import.js med --configure (kräver Node-RED-lösenordet i en fil).
5. Ta bort den gamla nyckeln i Console.

### D. Ändra AI-instruktionen (prompten)

1. Öppna docker/node-red/leaflimits/src/suggest-prepare.fn.js och ändra texten efter "system:".
2. Kör node docker/node-red/leaflimits/build.js och sedan enhetstesterna.
3. Prova i demon med en riktig bild.
4. Läs in den nya fliken på servern: ta bort den gamla med live-import.js --remove och importera på nytt (importera, --configure, --enable).

### E. Ändra en regel (till exempel hur många mätvärden som krävs för larm)

Reglerna står högst upp i src/common.js: ENTER_COUNT (3), EXIT_COUNT (2) och HYSTERESIS (0,02). Ändra värdet, kör build.js och testerna (några tester räknar med just 3 och 2 och behöver då uppdateras), och läs in fliken på nytt som ovan.

### F. Ångra allt

- Stäng av LeafLimits: live-import.js --disable. Systemet är då precis som förut.
- Ta bort fliken helt: live-import.js --remove.
- Stäng av teamets lagringsflik igen: live-import.js --disable-storage.
- Nödutgång: säkerhetskopian ligger i mappen ws/backups/live-nodered-2026-09-20 och kan läsas in igen.

### G. Sätta upp allt på en annan server

Det finns en färdigskriven installation (compose.yaml med skript som kontrollerar allt och startar, samt ett rökprov). Den är skriven och kontrollerad, men **inte körd på Docker än**. Stegen står i docs/DEPLOYMENT.md.

## 15. Del 12: Felsökning

| Symptom | Trolig orsak | Åtgärd |
|---|---|---|
| Appen säger "Wrong or missing access token" | Fel token i Inställningar, eller bara en del av den (den är 48 tecken) | Rensa fältet, skriv hela token och spara. Skriv aldrig AI-nyckeln där. |
| Appen visar 404 eller laddas inte | Fliken LeafLimits är avstängd, eller appfilerna saknas | live-import.js --status. Slå på med --enable. |
| "AI key rejected" | Nyckeln är ogiltig, utgången eller raderad | Kör check-key.sh, skapa ny nyckel (kapitel 14 C) |
| "AI account has no credit" | Slut på kredit hos Anthropic | Fyll på under Plans och Billing |
| Bild kan inte läsas | HEIC-format eller trasig fil | Välj JPEG eller PNG, eller använd kameran |
| Alla sensorer visar "Ingen gräns satt" | Inga gränser är sparade | Ta ett foto eller använd Redigera för hand och spara |
| "Väntar på mätvärde" länge | ESP32 skickar inte, eller lagrings- och valideringsflikarna är avstängda | Kontrollera att enheten är på och att flikarna är på i Node-RED |
| Ingen ny data i Grafana | Lagringsfliken avstängd, ESP32 av, eller sidan inte uppdaterad | Tryck Refresh. Kontrollera lagringsfliken. |
| InfluxDB Data Explorer visar fel "unsupported input type for mean" | Alla fält är ikryssade, också texten boot_id | Kryssa bara i fältet value (kapitel 6.3) |
| Vattnet och lufttemperaturen verkar förväxlade | ROM-adresserna är inte inställda i firmware | Se kapitel 4.2 (uppgift för PC-sessionen) |
| Larmet blinkar mellan hög och normal | Värdet ligger precis vid gränsen | Justera gränsen för hand, eller ändra HYSTERESIS (kapitel 14 E) |
| Ett kommando i skripten klagar på att filen inte finns | Nyckel- eller lösenordsfilen sparades på fel plats | Kör save-key.sh eller save-nodered-password.sh från repo-mappen, så hamnar filen rätt |

## 16. Vanliga frågor

**Varför lägger vi inte gränserna direkt i ESP32-programmet?**
Då måste man flasha om datorn varje gång man byter växt. Nu ändrar man bara i appen. Och all bedömning sker på servern, där den är lätt att testa och ändra.

**Varför valideringen och LeafLimits som två olika saker?**
För att de svarar på olika frågor: "kan värdet vara sant?" och "är värdet bra för växten?". Det första kastar bort värden, det andra bara markerar dem.

**Kan AI:n ha fel?**
Ja. Den ser bara ett foto och kan ta fel på växten eller föreslå för snäva eller för vida gränser. Därför granskar du alltid förslaget innan du sparar, och konfidensen visas.

**Vad händer om AI-tjänsten inte funkar?**
Appen fungerar ändå. Du kan skriva gränserna för hand. Övervakningen, larmen och graferna påverkas inte alls av AI-delen.

**Vad kostar det?**
Servern kostar som förut. AI-anropen kostar en bråkdel av en cent till några cent per foto. Spärren på 20 per timme och en månadsgräns hos Anthropic skyddar plånboken.

**Vad händer om ESP32 slutar skicka?**
Inga nya mätvärden kommer, och appen visar de gamla med en ålder. Inga falska larm skapas av tystnad. Lagringen och graferna visar en lucka.

**Vad händer om Node-RED startar om?**
Gränserna kommer tillbaka av sig själva (retained-meddelandet). De senaste värdena och tillstånden ligger i minnet och är tomma i några sekunder tills nya mätvärden kommit.

**Varför en Node-RED-flik och inte ett eget program?**
Det krävde ingen ny server, inget nytt program att hålla igång och ingen ändring av det som redan fungerade. Det lades in på några minuter och kan tas bort med ett kommando.

**Kan någon utomstående komma åt mina gränser?**
API:et kräver din token, men den skickas okrypterad över HTTP. På ett nät du inte litar på kan den avlyssnas. Det bör lösas med HTTPS.

**Kan jag lägga till fler enheter eller sensorer?**
Enheter: ja, appen har ett fält för enhetens namn och varje enhet får egna gränser. Nya sensortyper kräver att man lägger till dem i validering, lagring och LeafLimits.

## 17. Kända begränsningar och vad som återstår

| Sak | Läge |
|---|---|
| Vatten- och luftsensorn förväxlas kanske (ROM-adresser ej inställda) | Öppen. Uppgift för PC-sessionen tillsammans med hårdvaran. |
| Byt Node-RED-redigerarens lösenord | Ska göras, eftersom det delades i en chatt |
| AI-nyckeln går ut omkring 20 oktober 2026 | Skapa ny, gärna utan utgångstid |
| HTTP i stället för HTTPS | Öppen. Sätt HTTPS framför (nästa säkerhetssteg). |
| Grafana uppdateras inte automatiskt | Välj 5s eller 10s i Grafana. Standardpanelen tillhör teamet. |
| Inga gränser eller larm syns i Grafana | Första versionen skriver inget till InfluxDB. Kan läggas till. |
| Larmen har ingen mottagare | De publiceras på MQTT. Notis, mejl eller pip kan kopplas på senare. |
| Den portabla installationen (Docker) är inte körd än | Skriven och kontrollerad, men bevisas först vid en riktig körning |
| Ingen PWA (installera appen på hemskärmen) | Kräver HTTPS |
| MQTT-brokern tar emot vem som helst | Ligger utanför LeafLimits. Bör låsas med lösenord i ett säkerhetssteg. |

> **Sammanfattning i en mening:** en ESP32 skickar mätvärden till en server, som kontrollerar och sparar dem, och LeafLimits jämför dem med gränserna för just din växt (som en AI föreslår utifrån ett foto och som du själv godkänner) och talar om i appen om något ligger fel.
