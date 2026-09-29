import { icon } from '../assets/icons';

type IconProps = {
  name: string;
  size: number;
  width?: number;
  className?: string;
};

export function Icon({ name, size, width, className }: IconProps) {
  return <img src={icon(name)} width={width ?? size} height={size} alt="" aria-hidden className={className} />;
}
