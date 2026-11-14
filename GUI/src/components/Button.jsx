import React from 'react';
import { cx } from './cx.js';

export const BUTTON_VARIANTS = ['default', 'primary', 'danger', 'ghost'];

/**
 * Terminal button: shown as [ LABEL ] (brackets come from CSS), inverse video on hover / active.
 * props: variant 'default'|'primary'|'danger'|'ghost', active (bool, inverse video), small (bool),
 *        type ('button'), className, children; other props go to the <button>.
 */
const Button = React.forwardRef(function Button(
  { variant = 'default', active = false, small = false, type = 'button', className, children, ...rest },
  ref,
) {
  const safeVariant = BUTTON_VARIANTS.includes(variant) ? variant : 'default';
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn-${safeVariant}`, active && 'is-active', small && 'btn-sm', className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
