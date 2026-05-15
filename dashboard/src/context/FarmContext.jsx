import { createContext, useContext, useState, useEffect } from "react";
import { farmApi } from "../services/api";

const FarmContext = createContext({ farmId: null, farm: null, loading: true, refresh: () => {} });

export function FarmProvider({ children, user }) {
  const [farm, setFarm]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    try {
      const res = await farmApi.list();
      const farms = res.data.farms || [];

      if (farms.length > 0) {
        setFarm(farms[0]);
      } else {
        // Auto-create a default farm for new users so every page works immediately
        const created = await farmApi.create({
          name:      "Sunrise Farm",
          location:  { address: "Jaipur, Rajasthan, India", lat: 26.9124, lng: 75.7873 },
          area_ha:   2.4,
          crop_type: "Tomato, Potato, Pepper",
        });
        setFarm(created.data.farm);
      }
    } catch (err) {
      console.error("[FarmContext] Failed to load farm:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [user?.id]);

  return (
    <FarmContext.Provider value={{ farmId: farm?.id || null, farm, loading, refresh: load }}>
      {children}
    </FarmContext.Provider>
  );
}

export const useFarm = () => useContext(FarmContext);
