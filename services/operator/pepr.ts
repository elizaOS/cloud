import { PeprModule } from "pepr";
import cfg from "./package.json";
import { ServerController } from "./capabilities/index";

new PeprModule(cfg, [ServerController]);
