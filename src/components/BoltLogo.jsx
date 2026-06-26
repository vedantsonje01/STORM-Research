export default function BoltLogo({ size = 24, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      <path d="M19,5 L12,15 L16,15 L13,27 L20,17 L16,17 Z" fill="#4FC3F7" />
    </svg>
  );
}

export function StormText({ text, fontSize, boltSize, className, style }) {
  const chars = text || 'STORM';
  const bolt = boltSize || (fontSize ? fontSize * 1.55 : 90);

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <BoltLogo
        size={bolt}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <span style={{ position: 'relative', zIndex: 1 }}>{chars}</span>
    </span>
  );
}
