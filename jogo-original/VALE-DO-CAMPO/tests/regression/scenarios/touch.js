// Toque: joystick virtual (pointer events), botões Usar/Correr e hotbar.
export default async({p,step,shot})=>{
 await step(10);
 const box=await p.locator('#joy').boundingBox();const cx=box.x+box.width/2,cy=box.y+box.height/2;
 const cdp=await p.context().newCDPSession(p);
 const touch=async(type,x,y)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});await p.waitForTimeout(80);};
 await touch('touchStart',cx,cy);await touch('touchMove',cx+50,cy);await step(40);await touch('touchMove',cx,cy+50);await step(40);await touch('touchEnd');await step(10);
 await shot('t01_joystick');
 const btn=async(id)=>{const b=await p.locator(id).boundingBox();await touch('touchStart',b.x+b.width/2,b.y+b.height/2);await step(2);await touch('touchEnd');await step(10);};
 await btn('#btnR');await touch('touchStart',cx,cy);await touch('touchMove',cx-55,cy-20);await step(50);await touch('touchEnd');await step(5);await btn('#btnR');
 await shot('t02_run');
 await btn('#btnA');await step(30);await shot('t03_use');
 const slots=await p.locator('#hotbar .slot').count();if(slots>2){const b=await p.locator('#hotbar .slot').nth(2).boundingBox();await touch('touchStart',b.x+10,b.y+10);await touch('touchEnd');await step(5);}
 await btn('#btnA');await step(20);await shot('t04_slot');
};
