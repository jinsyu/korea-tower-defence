import Image from "next/image";
import { HOME_MAP_SIZE } from "@/lib/home-map-svg";
import { HOME_MAP_URL } from "@/lib/korea-map-url";

export function HomeMap() {
  return (
    <Image
      src={HOME_MAP_URL}
      alt=""
      unoptimized
      preload
      width={HOME_MAP_SIZE.width}
      height={HOME_MAP_SIZE.height}
      className="aspect-[1/0.95] h-auto w-[min(280px,64vw)] justify-self-center object-contain short-phone:w-[min(150px,40vw)] wide:col-start-2 wide:row-span-6 wide:row-start-1 wide:w-[min(520px,40vw)]"
    />
  );
}
