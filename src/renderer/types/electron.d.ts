import { HourForgeApi } from '../../preload';

declare global {
  interface Window {
    hourforge: HourForgeApi;
  }
}
