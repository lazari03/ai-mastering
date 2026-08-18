export default function LogoMark({ size = 28 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "var(--ember)",
        clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
      }}
    />
  );
}
