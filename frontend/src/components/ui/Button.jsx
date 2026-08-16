import Spinner from "./Spinner";
import Icon from "./Icon";

export default function Button({
  variant = "primary",
  size,
  loading = false,
  icon,
  iconRight,
  children,
  className = "",
  disabled,
  ...props
}) {
  const classes = ["btn", `btn-${variant}`];
  if (size) classes.push(`btn-${size}`);
  if (className) classes.push(className);

  return (
    <button
      className={classes.join(" ")}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {!loading && icon && <Icon name={icon} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </button>
  );
}
