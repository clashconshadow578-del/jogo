export default async({p,step,shot})=>{
 await step(5);await shot('00_start');
 await step(55);await shot('01_idle60');
 await p.keyboard.down('d');await step(60);await p.keyboard.up('d');await step(10);await shot('02_walk_right');
 await p.keyboard.down('s');await step(70);await p.keyboard.up('s');await step(10);await shot('03_walk_down');
 await p.keyboard.down('a');await p.keyboard.down('w');await step(40);await p.keyboard.up('a');await p.keyboard.up('w');await step(5);await shot('04_diag');
 await p.keyboard.press('2');await step(3);await p.keyboard.press('e');await step(30);await shot('05_action');
 await p.keyboard.press('i');await step(5);await shot('06_inventory');await p.keyboard.press('i');await step(3);
 await p.keyboard.press('m');await step(5);await shot('07_map');await p.keyboard.press('m');await step(3);
 // avança o tempo do jogo: 600 quadros de 50ms = ~30s de jogo
 for(let k=0;k<6;k++){await step(100,);}
 await shot('08_later');
};
