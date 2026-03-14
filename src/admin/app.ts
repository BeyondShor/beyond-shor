import type { StrapiApp } from '@strapi/strapi/admin';
import { TablePanel } from './components/TablePanel';

export default {
  config: {
    locales: [],
  },
  register(_app: StrapiApp) {},
  bootstrap(app: StrapiApp) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (app as any).getPlugin('content-manager');
    if (cm?.apis?.addEditViewSidePanel) {
      cm.apis.addEditViewSidePanel([TablePanel]);
    }
  },
};
