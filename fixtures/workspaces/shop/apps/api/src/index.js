import { formatPrice } from '@shop/utils';

export function price(cents) {
  return { display: formatPrice(cents) };
}
