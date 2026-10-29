// Cenário longo: noite, tempestade, sono, interior, troca de região, vila e ações.
export default async({p,step,shot})=>{
 const g=(code)=>p.evaluate(c=>window.VDC?window.VDC.run(c):(0,eval)(c),code);
 const press=async(k,n=1)=>{await p.keyboard.press(k);await step(n);};
 const hold=async(k,n)=>{await p.keyboard.down(k);await step(n);await p.keyboard.up(k);};
 await step(20);
 // ferramentas
 await press('1',2);await press('e',20);await press('2',2);await press('e',20);await press('4',2);
 for(let i=0;i<4;i++){await hold('a',12);await press('e',25);}
 await shot('f01_tools');
 // tempestade
 await g('climate.day=S.day;climate.kind=3;climate.start=0;climate.end=1190;climate.heavy=1;0');
 await step(400);await shot('f02_storm');
 // noite
 await g('S.min=1000;0');await step(200);await shot('f03_dusk');
 await g('S.min=1120;0');await step(300);await shot('f04_night');
 // interior da casa
 await g('S.px=DOOR.x*TS+8;S.py=DOOR.y*TS+18;0');await step(5);await g('useDoor();0');await step(40);await shot('f05_inside');
 await hold('a',30);await shot('f06_inside_walk');
 await g('useDoor();0');await step(40);
 // dormir
 await g('dormir(false);0');await step(80);await shot('f07_morning');
 // vila (região vizinha a leste): caminhar até a borda
 await g('S.px=MW*TS-TS-2;S.py=45*TS+8;0');await p.keyboard.down('d');
 for(let i=0;i<20;i++){await step(5);await p.waitForTimeout(80);}
 await p.keyboard.up('d');
 for(let i=0;i<20;i++){await step(5);await p.waitForTimeout(80);}
 await step(60);await shot('f08_region');
 await hold('d',120);await shot('f09_walk_region');
 await step(600);await shot('f10_later');
};
