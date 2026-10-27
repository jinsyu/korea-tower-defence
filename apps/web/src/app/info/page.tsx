import Link from "next/link";
import type { ReactNode } from "react";
import { BugTag, broadcastButton } from "@/components/broadcast";
import { DeleteRecord, NewRecoveryCode } from "@/components/info-actions";
import { MySettings } from "@/components/my-settings";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "정보",
  description:
    "놀이 방법, 서버에 저장하는 것과 저장하지 않는 것, 지도·도로 데이터의 출처와 라이선스, 수학 문제의 성취기준 근거를 적었어요. 복구 코드 새로 만들기와 내 기록 지우기도 여기서 해요.",
  path: "/info",
});

const boxClass = "grid gap-2 border-l-4 border-cyan bg-navy px-3 py-2.5 text-sm leading-[1.6] text-[#dfe7ff]";
const listClass = "list-disc pl-5";
const linkClass = "font-bold break-all text-cyan underline underline-offset-2";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-2">
      <h2 id={id} className="font-heading text-[clamp(20px,2.4vw,30px)] text-yellow">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={linkClass} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function InfoPage() {
  return (
    <main className="grid flex-1 justify-items-center p-3.5">
      <div className="grid w-[min(900px,100%)] min-w-0 content-start gap-5">
        <div className="grid gap-2">
          <BugTag live="정보">가입도, 이름도 없어요</BugTag>
          <h1 className="font-heading text-[clamp(28px,4.4vw,64px)] leading-[1.05]">정보</h1>
        </div>

        <Section id="how" title="놀이 방법">
          <ol className={`${boxClass} list-decimal pl-7`}>
            <li>지킬 지역, 별명과 타워 계열을 고르고 복구 코드를 받아요.</li>
            <li>우리 지역 방어판이 생중계되고, 계산 문제가 끝없이 나와요.</li>
            <li>맞히면 포인트가 쌓이고, 레벨과 타워가 저절로 자라요. 내 타워 힘은 우리 지역 화력에 더해져요.</li>
            <li>지역은 1분마다 웨이브 하나를 막아요. 화력이 모자라면 뚫려서 웨이브가 5만큼 뒤로 가요.</li>
            <li>아무도 없어도 웨이브는 계속 흘러요. 다시 오면 그동안의 일을 &quot;지난 소식&quot;으로 보여 줘요.</li>
          </ol>
        </Section>

        <Section id="mine" title="내 지킴이 바꾸기">
          <MySettings />
        </Section>

        <Section id="code" title="복구 코드">
          <NewRecoveryCode />
        </Section>

        <Section id="stored" title="서버에 무엇을 저장하나요">
          <div className={boxClass}>
            <p className="font-black text-white">저장하는 것</p>
            <ul className={listClass}>
              <li>별명 번호(목록에서 고른 낱말의 번호와 꼬리표)</li>
              <li>지킬 지역</li>
              <li>레벨·포인트·타워(단계, 계열, 색, 스탯)</li>
              <li>최근 50문제의 정답 여부와 푸는 데 걸린 시간</li>
              <li>마지막 접속 날짜(날짜만, 시각은 저장하지 않아요)</li>
              <li>복구 코드와 기기 열쇠는 원래 값으로 되돌릴 수 없게 바꾼 값(해시)만 저장해요.</li>
            </ul>
            <p className="font-black text-white">저장하지 않는 것</p>
            <ul className={listClass}>
              <li>이름, 나이, 학교, 반, 연락처, 사진, 목소리, 위치</li>
              <li>IP, 브라우저 정보, 기기 정보, 분 단위 접속 기록</li>
              <li>복구 코드를 너무 많이 틀리는지 셀 때는 IP를 되돌릴 수 없는 값으로 바꿔 1시간 동안 메모리에만 두고 버려요.</li>
            </ul>
            <p>이 기기에는 기기 열쇠와 화면 설정만 남아요.</p>
            <p>365일 동안 들어오지 않은 지킴이 기록은 지워지고, 그 타워 힘은 지역 화력에서 빠져요.</p>
          </div>
        </Section>

        <Section id="math" title="수학 문제의 성취기준 근거">
          <div className={boxClass}>
            <p>문제는 2022 개정 교육과정 수학과 성취기준에 맞춰 만들어요. 모두 곱셈구구(2~9단) 문제예요.</p>
            <ul className={listClass}>
              <li>곱셈구구: [2수01-11]</li>
            </ul>
          </div>
        </Section>

        <Section id="sources" title="출처·라이선스·데이터 공개">
          <div className={boxClass}>
            <h3 className="font-black text-white">지도 경계</h3>
            <p>
              통계청 통계지리정보서비스(SGIS, <Ext href="https://sgis.kostat.go.kr">sgis.kostat.go.kr</Ext>)가 공공누리 제1유형으로
              개방한 행정동 경계를 vuski/admdongkor(<Ext href="https://github.com/vuski/admdongkor">github.com/vuski/admdongkor</Ext>,
              ver20261001)가 가공해{" "}
              <Ext href="https://creativecommons.org/licenses/by/4.0/deed.ko">CC BY 4.0</Ext>으로 배포한 것이에요. 고장 탐험대가 이
              경계를 시·도, 시·군·구 단위로 합치고(일반구는 상위 시로, 서울 밖 광역시와 광주는 한 칸으로) 단순화했고, 이
              서비스는 그 결과를 185곳 지도로 써요.
            </p>
            <h3 className="font-black text-white">도로와 지역 판</h3>
            <p>
              지역 판의 길은 OpenStreetMap 데이터로 만들어요. © OpenStreetMap 기여자(
              <Ext href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</Ext>). OpenStreetMap 데이터는{" "}
              <Ext href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</Ext> 라이선스예요.
            </p>
            <p>
              지금 받을 수 있는 데이터: 화면에 그리기 좋게 바꾼 185곳 지도 경계(위 &quot;지도 경계&quot;, CC BY 4.0)는 이 사이트의{" "}
              <code className="break-all">/map/20261001/korea.json</code>에 있어요.
            </p>
            <p>
              <b className="text-white">지역 판 파일(준비 중, 예정):</b> 185곳의 지역 판 파일은 아직 만들지 않았어요. 만들면 이
              사이트의 <code className="break-all">/stages/&lt;버전&gt;/&lt;지역 코드&gt;.json</code>에 ODbL 1.0으로 공개할
              예정이에요. 만드는 방법(예정): OpenStreetMap의 큰 길을 지역 경계 안으로 자르고 단순화한 뒤, 이웃 지역과 맞닿은 곳에
              입구를, 길 끝에 지킬 곳을, 길가에 타워 자리를 둬요. 파일마다 출처·라이선스·OSM 추출 날짜를 넣어요.
            </p>
            <h3 className="font-black text-white">글꼴</h3>
            <p>
              Black Han Sans, Gothic A1 (<Ext href="https://openfontlicense.org">SIL Open Font License 1.1</Ext>)
            </p>
            <h3 className="font-black text-white">에셋 출처</h3>
            <p>타워·풍선·효과 그림은 모두 이 서비스가 코드로 직접 그렸어요(자체 제작). 다른 곳에서 가져온 그림은 아직 없어요.</p>
            <h3 className="font-black text-white">프로그램 코드</h3>
            <p>MIT License</p>
          </div>
        </Section>

        <Section id="delete" title="내 기록 지우기">
          <DeleteRecord />
        </Section>

        <div className="flex flex-wrap gap-2.5 pb-4">
          <Link href="/" className={`${broadcastButton} bg-white`}>
            첫 화면으로
          </Link>
        </div>
      </div>
    </main>
  );
}
