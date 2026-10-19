import { extendTailwindMerge, twJoin, type ClassNameValue } from 'tailwind-merge';

const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'tiny',
        'mini',
        'micro',
        'caption',
        'tree',
        'label',
        'small',
        'body',
        'brand',
        'title',
        'heading',
      ],
    },
  },
});

/** Conditional classes with predictable utility overrides for shared components. */
export function cn(...values: ClassNameValue[]) {
  return merge(twJoin(values));
}
