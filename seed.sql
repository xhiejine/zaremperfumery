INSERT INTO products(name,category,type,gender,image_url,is_new,description) VALUES
('10ml Hexagon Decant Bottle','Empty Bottles','Decant bottle',NULL,'/img/hexagon.jpg',1,'Hexagon-shaped 10ml decant bottle.'),
('50ml Matte Perfume Bottles','Empty Bottles','Matte bottle',NULL,'/img/matte.jpg',1,'Matte finish bottles with gold-tone caps, available in several colours.'),
('20ml Perfume Bottles - Wood & Colour Caps','Empty Bottles','Spray bottle',NULL,'/img/cap20.jpg',1,'20ml bottles with wood-look and coloured caps.'),
('10ml Decant Syringe','Empty Bottles','Decant tool',NULL,'/img/syringe.jpg',1,'10ml decant syringe in several colours.'),
('La Nuit Tresor (perfume oil)','Perfume Oils','Perfume oil','Women','/img/oils.jpg',0,'Feminine fragrance oil. Sizes and prices confirmed on request.');
INSERT INTO variants(product_id,size,price_kobo,stock) SELECT id,CASE WHEN name LIKE '10ml%' THEN '10ml' WHEN name LIKE '50ml%' THEN '50ml' WHEN name LIKE '20ml%' THEN '20ml' ELSE 'Size on request' END,NULL,NULL FROM products;
