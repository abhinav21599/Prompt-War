import requests

def test_cdse_spatial():
    url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
    # Search around Arabian Sea (Goa / Mumbai offshore: lons 70 to 74, lats 14 to 17)
    aoi_wkt = "geography'SRID=4326;POLYGON((70.0 14.0, 74.0 14.0, 74.0 17.0, 70.0 17.0, 70.0 14.0))'"
    params = {
        "$filter": f"Collection/Name eq 'SENTINEL-1' and contains(Name,'IW_GRDH') and OData.CSC.Intersects(area={aoi_wkt}) and ContentDate/Start ge 2024-03-01T00:00:00.000Z and ContentDate/Start le 2024-03-25T23:59:59.000Z",
        "$top": 3
    }
    r = requests.get(url, params=params, timeout=15)
    print("Spatial status:", r.status_code)
    if r.status_code == 200:
        val = r.json().get("value", [])
        print("Found items in AOI:", len(val))
        for item in val:
            print("Item:", item["Name"])
            print("Acquisition:", item["ContentDate"]["Start"])
            print("Footprint:", item["GeoFootprint"]["coordinates"][0][:2])
    else:
        print("Error:", r.text[:300])

if __name__ == "__main__":
    test_cdse_spatial()
