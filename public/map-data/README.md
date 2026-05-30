# Map Data - Static OpenStreetMap Data

This directory contains pre-processed OpenStreetMap data for downtown Toronto
(CN Tower / Financial District / Yonge-Dundas area).

## Data Files

- `buildings.json` - Building footprints with heights and roof shapes
- `roads.json` - Road network nodes and edges with routing information
- `traffic-signals.json` - Traffic signals and stop signs

## Bounding Box

All data covers the following area:
- South: 43.640°
- West:  -79.395°
- North: 43.660°
- East:  -79.365°

That's roughly 2.2 km × 2.4 km around Union Station / the Financial District.

## Data Source

Data was downloaded from the OpenStreetMap Overpass API and processed offline.

## Updating the Data

To update the map data:

1. Download fresh data (Overpass mirror — `overpass.kumi.systems` works when the
   main endpoint refuses):

```bash
# Buildings
curl -G "https://overpass.kumi.systems/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:120];(way["building"](43.640,-79.395,43.660,-79.365););(._;>;);out body;' \
  -o public/map-data/buildings-raw.json

# Traffic signals + stop signs
curl -G "https://overpass.kumi.systems/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:60];(node["highway"="traffic_signals"](43.640,-79.395,43.660,-79.365);node["highway"="stop"](43.640,-79.395,43.660,-79.365););out body;' \
  -o public/map-data/traffic-signals-raw.json

# Roads
curl -G "https://overpass.kumi.systems/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:120];(way["highway"~"^(primary|secondary|tertiary|residential|unclassified)$"](43.640,-79.395,43.660,-79.365););(._;>;);out body;' \
  -o public/map-data/roads-raw.json
```

2. Process the raw data:
```bash
npx tsx scripts/process-map-data.ts
```

3. The processed JSON files will be updated and ready to use

## Benefits

- No external API calls at runtime - instant map loading
- Offline capable - works without internet
- Faster performance - no network latency
- Cost effective - no API rate limits or quotas
- Predictable - consistent data every time

## License

OpenStreetMap data is © OpenStreetMap contributors and available under the Open
Database License (ODbL).
