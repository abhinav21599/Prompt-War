import Investigation from "./pages/investigation";
import Landing from "./pages/landing";
import CommandCenter from "./pages/CommandCenter";
import DetectionPage from "./pages/DetectionPage";
import DriftPage from "./pages/DriftPage";
import ForecastPage from "./pages/ForecastPage";
import VesselInvestigationPage from "./pages/VesselInvestigationPage";
import DigitalTwinPage from "./pages/DigitalTwinPage";
import ReportPage from "./pages/ReportPage";
import AnalyzePage from "./pages/AnalyzePage";
import NotFound from "./pages/NotFound";

import AppShell from "./components/AppShell";

export const routers = [
  {
    path: "/",
    name: "home",
    element: <Landing />,
  },
  {
    path: "/landing",
    name: "landing",
    element: <Landing />,
  },
  {
    path: "/globe",
    name: "globe",
    element: <Landing />,
  },
  {
    path: "/investigation",
    name: "investigation",
    element: <Investigation />,
  },
  {
    element: <AppShell />,
    children: [
      {
        path: "/incidents",
        name: "incidents",
        element: <CommandCenter />,
      },
      {
        path: "/command-center",
        name: "command-center",
        element: <CommandCenter />,
      },
      {
        path: "/analyze",
        name: "analyze",
        element: <AnalyzePage />,
      },
      {
        path: "/spills/:id/detection",
        name: "spill-detection",
        element: <DetectionPage />,
      },
      {
        path: "/spills/:id/drift",
        name: "spill-drift",
        element: <DriftPage />,
      },
      {
        path: "/spills/:id/forecast",
        name: "spill-forecast",
        element: <ForecastPage />,
      },
      {
        path: "/spills/:id/vessels",
        name: "spill-vessels",
        element: <VesselInvestigationPage />,
      },
      {
        path: "/spills/:id/digital-twin",
        name: "spill-digital-twin",
        element: <DigitalTwinPage />,
      },
      {
        path: "/spills/:id/report",
        name: "spill-report",
        element: <ReportPage />,
      },
      // /incidents/:id/* compatibility paths
      {
        path: "/incidents/:id",
        element: <DetectionPage />,
      },
      {
        path: "/incidents/:id/detection",
        element: <DetectionPage />,
      },
      {
        path: "/incidents/:id/drift",
        element: <DriftPage />,
      },
      {
        path: "/incidents/:id/forecast",
        element: <ForecastPage />,
      },
      {
        path: "/incidents/:id/vessels",
        element: <VesselInvestigationPage />,
      },
      {
        path: "/incidents/:id/timeline",
        element: <DigitalTwinPage />,
      },
      {
        path: "/incidents/:id/report",
        element: <ReportPage />,
      },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
