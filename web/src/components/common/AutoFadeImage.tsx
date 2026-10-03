import React, { useEffect, useRef, useState } from 'react';

interface AutoFadeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

/**
 * 图片淡入：对齐原版 `cached_network_image` 的默认淡入行为
 * （Kazumi/lib/bean/card/network_img_layer.dart 使用 CachedNetworkImage，默认 500ms 淡入，
 *   Web 侧取 300ms 以匹配 durations.image）。
 */
export const AutoFadeImage: React.FC<AutoFadeImageProps> = ({
  src,
  className,
  onLoad,
  ...rest
}) => {
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const img = ref.current;
    // 命中缓存时 onLoad 可能早于 React 绑定，主动检查一次 complete
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <img
      {...rest}
      ref={ref}
      src={src}
      className={`kz-img ${loaded ? 'kz-img-loaded' : ''} ${className ?? ''}`}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      draggable={false}
    />
  );
};

export default AutoFadeImage;
