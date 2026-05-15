import { createContext, useContext } from "react";
export const AlertCountContext = createContext({ count: 0, refresh: () => {} });
export const useAlertCount = () => useContext(AlertCountContext);